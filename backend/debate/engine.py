"""
debate/engine.py — 辩论引擎

核心职责：
1. 多轮循环（round 1..N）
2. 每轮并行调用所有官员（asyncio.gather）
3. 攒完 LLM 流式输出后，通过 WebSocket 推送
4. 检测 SILENT，区分 official_speech / official_silent
5. 维护 context.history，供下一轮注入
6. 所有轮次结束后调用丞相生成总结

注意：engine.run() 设计为在后台 Task 中运行，
通过 DebateStreamer 向前端推流，不直接返回值。
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

from agents.base import OfficialAgent, SILENT_TOKEN
from agents.loader import load_selected_officials
from debate.streaming import DebateStreamer
from llm.fallback import UserKey, chat_with_fallback

logger = logging.getLogger(__name__)

# 丞相 ID（负责最终总结）
CHANCELLOR_ID = "chancellor"

# 总结 prompt 模板
CHANCELLOR_SUMMARY_SYSTEM = (
    "你是内阁首辅，所有大臣辩论结束后由你做最终总结。你不是记录员，你是决策顾问。\n\n"
    "你的总结必须包含以下三部分，简明扼要：\n"
    "1.【核心矛盾】用一两句话点出各方争论的本质分歧是什么（不要逐一复述每个人说了啥，皇上都听到了）。\n"
    "2.【臣的建议】明确给出你的建议方案——支持哪一方、或者怎样融合，但必须逻辑自洽。"
    "如果多方观点确实无法调和，就直接选你认为最优的那个。绝不能强行缝合矛盾的观点，也不要说'各有道理'这种废话。\n"
    "3.【理由简述】用一两句话说明为什么这个建议最合理。\n\n"
    "最后以'请皇上圣裁'收尾。全文不超过 300 字。语气沉稳果断，像一个真正在拍板的决策者。"
)


@dataclass
class DebateConfig:
    topic: str
    official_ids: list[str]
    rounds: int = 2
    settings: dict[str, Any] = field(default_factory=lambda: {
        "length": "medium",
        "style": "modern",
    })
    user_key: UserKey | None = None
    custom_officials: list = field(default_factory=list)  # CustomOfficialData 列表
    web_search: bool = False  # 是否启用联网搜索（仅 GLM4 生效）


@dataclass
class DebateContext:
    topic: str
    history: list[dict] = field(default_factory=list)
    settings: dict[str, Any] = field(default_factory=dict)
    all_officials: list[dict] = field(default_factory=list)  # [{id, name, rank}, ...]

    def to_dict(self) -> dict:
        return {
            "topic": self.topic,
            "history": self.history,
            "settings": self.settings,
            "all_officials": self.all_officials,
        }


class DebateEngine:
    """
    辩论引擎：驱动一次完整朝会。

    使用方式：
        engine = DebateEngine(config, streamer)
        await engine.run()
    """

    def __init__(self, config: DebateConfig, streamer: DebateStreamer):
        self.config = config
        self.streamer = streamer

    async def run(self) -> None:
        """执行完整辩论流程"""
        # 分离预设官员 ID 和自定义官员 ID
        preset_ids = [
            oid for oid in self.config.official_ids
            if oid != CHANCELLOR_ID and not oid.startswith("custom_")
        ]

        # 加载预设官员（不含丞相，丞相在最后单独处理）
        officials = load_selected_officials(preset_ids)

        # 追加自定义官员（来自 custom_officials 字段）
        from agents.loader import create_custom_agent
        for custom_data in self.config.custom_officials:
            if custom_data.id != CHANCELLOR_ID:
                officials.append(create_custom_agent(custom_data))

        logger.warning(
            "参与官员: preset_ids=%s, custom_officials=%s, loaded=%d",
            preset_ids,
            [getattr(c, 'id', str(c)) for c in self.config.custom_officials],
            len(officials),
        )

        if not officials:
            logger.warning(
                "no_officials! official_ids=%s, custom_officials count=%d",
                self.config.official_ids,
                len(self.config.custom_officials),
            )
            await self.streamer.send_error(
                "no_officials", "没有可用的官员，请检查官员 ID 配置"
            )
            return

        # 构建上下文
        context = DebateContext(
            topic=self.config.topic,
            settings=self.config.settings,
            all_officials=[
                {"id": o.id, "title": o.config.title, "rank": o.rank}
                for o in officials
            ],
        )

        try:
            # 多轮辩论
            for round_num in range(1, self.config.rounds + 1):
                await self._run_round(officials, context, round_num)

            # 丞相总结
            await self._run_chancellor_summary(context)

            # 辩论结束
            await self.streamer.send_debate_complete()

        except asyncio.CancelledError:
            # 皇帝打断（P1 功能）
            logger.info("辩论被取消 [%s]", self.streamer.debate_id)
            raise
        except Exception as exc:
            logger.exception("辩论引擎异常 [%s]", self.streamer.debate_id)
            await self.streamer.send_error(
                "engine_error", f"辩论引擎异常：{exc}"
            )

    # ------------------------------------------------------------------
    # 单轮处理
    # ------------------------------------------------------------------

    async def _run_round(
        self,
        officials: list[OfficialAgent],
        context: DebateContext,
        round_num: int,
    ) -> None:
        await self.streamer.send_round_start(round_num)

        # 先推送"正在思考"（逐个）
        for o in officials:
            await self.streamer.send_official_thinking(o.id, o.title, round_num)

        # 所有轮次统一顺序调用，每位官员能看到本轮前面已发言的内容
        # 每位官员：thinking → 流式发言(逐字推送) → 发言完成 → 下一位
        round_speeches: list[dict] = []
        same_round_so_far: list[dict] = []
        for o in officials:
            # 发言（流式推送 token）
            result = await _speak_with_same_round(
                o, context.to_dict(), round_num,
                same_round_so_far, self.config.user_key,
                streamer=self.streamer,
                web_search=self.config.web_search,
            )

            # 判断发言内容
            if isinstance(result, Exception):
                logger.warning("官员 %s 发言失败: %s", o.id, result)
                await self.streamer.send_official_silent(o.id, o.title)
                speech_content = SILENT_TOKEN
            elif result.strip().upper() == SILENT_TOKEN:
                await self.streamer.send_official_silent(o.id, o.title)
                speech_content = SILENT_TOKEN
            else:
                # 流式 token 已在 _speak_with_same_round 中推送
                # 这里发一个 speech_done 标记完成，并附带完整文本
                await self.streamer.send_official_speech_done(
                    o.id, o.title, o.rank, round_num, result
                )
                speech_content = result

            # 记录本轮发言
            speech_record = {
                "official_id": o.id,
                "title": o.title,
                "rank": o.rank,
                "content": speech_content,
            }
            same_round_so_far.append(speech_record)
            round_speeches.append(speech_record)

        # 本轮结束：保存历史，供下轮注入
        context.history.append({
            "round": round_num,
            "speeches": round_speeches,
        })

        await self.streamer.send_round_complete(round_num)

    # ------------------------------------------------------------------
    # 丞相总结
    # ------------------------------------------------------------------

    async def _run_chancellor_summary(self, context: DebateContext) -> None:
        """调用 LLM 生成丞相总结并推送"""
        summary_messages = _build_chancellor_messages(context)

        summary_content = ""
        try:
            async for token in chat_with_fallback(
                summary_messages,
                user_key=self.config.user_key,
                stream=True,
                max_tokens=500,
            ):
                summary_content += token
        except Exception as exc:
            logger.warning("丞相总结生成失败: %s", exc)
            summary_content = "综合各位所奏，请皇上圣裁。"

        await self.streamer.send_chancellor_summary(summary_content.strip())


def _build_chancellor_messages(context: DebateContext) -> list[dict]:
    """构建丞相总结的 messages"""
    lines = [f"议题：{context.topic}", "", "各方发言记录："]
    for round_record in context.history:
        r = round_record.get("round", "?")
        lines.append(f"\n--- 第 {r} 轮 ---")
        for speech in round_record.get("speeches", []):
            title = speech.get("title", "某官")
            content = speech.get("content", "（沉默）")
            if content == SILENT_TOKEN:
                content = "（沉默）"
            lines.append(f"{title}：{content}")

    settings = context.settings
    style_hint = (
        "尽量使用文言文" if settings.get("style") == "classical"
        else "用现代白话文，语言清晰简洁，像一个果断的决策者在拍板"
    )
    lines.append(f"\n{style_hint}。不要逐一复述每个人的话，直接说核心矛盾和你的建议。不超过 300 字。")

    return [
        {"role": "system", "content": CHANCELLOR_SUMMARY_SYSTEM},
        {"role": "user", "content": "\n".join(lines)},
    ]


async def _speak_with_same_round(
    official: OfficialAgent,
    context_dict: dict,
    round_num: int,
    same_round_speeches: list[dict],
    user_key,
    streamer: DebateStreamer | None = None,
    web_search: bool = False,
) -> str:
    """顺序发言辅助函数：传入同轮已发言，让官员能看到本轮前面的发言内容。
    如果传入 streamer，则边收 token 边推送流式输出。

    容错：即使 LLM 调用出错（如偶发 JSON 解析错误），也不会中断整个辩论。
    已收到的部分内容会保留；如果完全没有内容则返回 SILENT。"""
    from agents.prompt_builder import build_messages
    from llm.fallback import chat_with_fallback

    messages = build_messages(
        official.config,
        context_dict,
        round_num,
        same_round_speeches=same_round_speeches if same_round_speeches else None,
        web_search=web_search,
    )

    full_content = ""
    try:
        async for token in chat_with_fallback(
            messages,
            user_key=user_key,
            stream=True,
            temperature=0.95,   # 提高多样性
            web_search=web_search,
        ):
            full_content += token
            # 流式推送每个 token
            if streamer:
                try:
                    await streamer.send_official_speech_token(
                        official.id, official.title, official.rank, round_num, token
                    )
                except Exception:
                    pass  # WebSocket 断开时不中断 LLM 调用
    except Exception as exc:
        logger.warning(
            "官员 %s (%s) 发言 LLM 调用异常: %s，已获得部分内容 %d 字",
            official.id, official.title, exc, len(full_content),
        )
        # 不抛出，使用已有的部分内容或回退为 SILENT

    full_content = full_content.strip()
    return full_content if full_content else "SILENT"
