"""
agents/base.py — OfficialAgent 基类

每个官员对应一个 OfficialAgent 实例，负责：
- 维护自身配置（来自 officials.json）
- 调用 LLM 生成发言
- 判断是否沉默（SILENT）
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


SILENT_TOKEN = "SILENT"


@dataclass
class OfficialConfig:
    """官员配置，对应 officials.json 中的单个条目"""
    id: str
    name: str
    title: str
    rank: int                          # 1（最高）~ 9（最低）
    personality: str = ""
    system_prompt: str = ""
    avatar: str = ""
    faction: str = ""
    is_default: bool = True
    extra: dict[str, Any] = field(default_factory=dict)


class OfficialAgent:
    """
    代表朝堂中的一名官员。

    职责：
    - 持有 OfficialConfig
    - 通过 speak() 方法返回本轮发言内容（或 SILENT_TOKEN）
    - speak() 内部调用 LLM fallback 链，流式累积完整文本后返回
    """

    def __init__(self, config: OfficialConfig):
        self.config = config

    @property
    def id(self) -> str:
        return self.config.id

    @property
    def name(self) -> str:
        return self.config.name

    @property
    def rank(self) -> int:
        return self.config.rank

    async def speak(
        self,
        context: dict,
        round_num: int,
        user_key=None,
    ) -> str:
        """
        生成本轮发言。

        Args:
            context: 辩论上下文 {"topic": str, "history": [...], "settings": {...}, "all_officials": [...]}
            round_num: 当前轮次（1-based）
            user_key: 用户自带 Key（UserKey | None）

        Returns:
            发言内容字符串，或 SILENT_TOKEN（"SILENT"）
        """
        from agents.prompt_builder import build_messages
        from llm.fallback import chat_with_fallback

        messages = build_messages(self.config, context, round_num)

        # 流式累积完整内容
        full_content = ""
        async for token in chat_with_fallback(
            messages,
            user_key=user_key,
            stream=True,
        ):
            full_content += token

        full_content = full_content.strip()
        return full_content if full_content else SILENT_TOKEN
