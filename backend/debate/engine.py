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
    "你是内阁首辅（丞相），负责归纳朝堂各方意见，协助皇上做出决策。"
    "语言简练，条理清晰，先陈述各方核心分歧，再提出你的归纳建议。"
    "不超过 300 字。"
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
        # 加载参与官员（不含丞相，丞相在最后单独处理）
        officials = load_selected_officials([
            oid for oid in self.config.official_ids if oid != CHANCELLOR_ID
        ])

        # 追加自定义官员
        from agents.loader import create_custom_agent
        for custom_data in self.config.custom_officials:
            if custom_data.id != CHANCELLOR_ID:
                officials.append(create_custom_agent(custom_data))

        if not officials:
            await self.streamer.send_error(
                "no_officials", "没有可用的官员，请检查官员 ID 配置"
            )
            return

        # 构建上下文
        context = DebateContext(
            topic=self.config.topic,
            settings=self.config.settings,
            all_officials=[
                {"id": o.id, "name": o.name, "rank": o.rank}
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

        # 先并行推送"正在思考"
        thinking_tasks = [
            self.streamer.send_official_thinking(o.id, o.name, round_num)
            for o in officials
        ]
        await asyncio.gather(*thinking_tasks, return_exceptions=True)

        # 第 1 轮：并行调用（无同轮历史可注入，靠禁止重复约束降低相似度）
        # 第 2 轮起：顺序调用，每位官员能看到本轮前面已发言的内容
        if round_num == 1:
            speak_tasks = [
                o.speak(context.to_dict(), round_num, self.config.user_key)
                for o in officials
            ]
            results = await asyncio.gather(*speak_tasks, return_exceptions=True)
        else:
            # 顺序调用，累积同轮已发言
            results = []
            same_round_so_far: list[dict] = []
            for o in officials:
                result = await _speak_with_same_round(
                    o, context.to_dict(), round_num,
                    same_round_so_far, self.config.user_key
                )
                results.append(result)
                # 将本次结果加入同轮记录，供后续官员参考
                content = result if not isinstance(result, Exception) else "SILENT"
                same_round_so_far.append({
                    "official_id": o.id,
                    "name": o.name,
                    "rank": o.rank,
                    "content": content,
                })

        # 推送发言结果 & 收集本轮 speeches（顺序推送）
        round_speeches: list[dict] = []
        for official, result in zip(officials, results):
            if isinstance(result, Exception):
                logger.warning("官员 %s 发言失败: %s", official.id, result)
                await self.streamer.send_official_silent(official.id, official.name)
                round_speeches.append({
                    "official_id": official.id,
                    "name": official.name,
                    "rank": official.rank,
                    "content": SILENT_TOKEN,
                })
                continue

            content: str = result
            if content.strip().upper() == SILENT_TOKEN:
                await self.streamer.send_official_silent(official.id, official.name)
                round_speeches.append({
                    "official_id": official.id,
                    "name": official.name,
                    "rank": official.rank,
                    "content": SILENT_TOKEN,
                })
            else:
                await self.streamer.send_official_speech(
                    official.id, official.name, official.rank, round_num, content
                )
                round_speeches.append({
                    "official_id": official.id,
                    "name": official.name,
                    "rank": official.rank,
                    "content": content,
                })

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
    lines = [f"议题：{context.topic}", "", "朝堂发言记录："]
    for round_record in context.history:
        r = round_record.get("round", "?")
        lines.append(f"\n【第 {r} 轮】")
        for speech in round_record.get("speeches", []):
            name = speech.get("name", "某官")
            content = speech.get("content", "（沉默）")
            if content == SILENT_TOKEN:
                content = "（沉默）"
            lines.append(f"  {name}：{content}")

    settings = context.settings
    style_hint = (
        "尽量使用文言文" if settings.get("style") == "classical"
        else "语言清晰，文白夹杂即可"
    )
    lines.append(f"\n请以丞相身份归纳总结，{style_hint}，不超过 300 字。")

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
) -> str:
    """顺序发言辅助函数：传入同轮已发言，让官员能看到本轮前面的发言内容"""
    from agents.prompt_builder import build_messages
    from llm.fallback import chat_with_fallback

    messages = build_messages(
        official.config,
        context_dict,
        round_num,
        same_round_speeches=same_round_speeches if same_round_speeches else None,
    )

    full_content = ""
    async for token in chat_with_fallback(
        messages,
        user_key=user_key,
        stream=True,
        temperature=0.95,   # 提高多样性
    ):
        full_content += token

    full_content = full_content.strip()
    return full_content if full_content else "SILENT"
