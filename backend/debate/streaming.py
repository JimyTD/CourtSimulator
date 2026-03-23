"""
debate/streaming.py — WebSocket 推流管理

封装向单个 WebSocket 连接发送结构化消息的工具函数。
DebateStreamer 持有一个 WebSocket 连接，所有消息通过它统一发出。
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class DebateStreamer:
    """
    针对一次朝会辩论的 WebSocket 推流器。

    所有推送方法均与 API.md 中定义的消息格式严格对应。
    """

    def __init__(self, websocket: WebSocket, debate_id: str, total_rounds: int):
        self.ws = websocket
        self.debate_id = debate_id
        self.total_rounds = total_rounds

    # ------------------------------------------------------------------
    # 基础发送
    # ------------------------------------------------------------------

    async def send(self, payload: dict[str, Any]) -> None:
        """发送任意 JSON payload"""
        try:
            await self.ws.send_text(json.dumps(payload, ensure_ascii=False))
        except Exception as exc:
            logger.warning("WebSocket 发送失败 [%s]: %s", self.debate_id, exc)
            raise

    # ------------------------------------------------------------------
    # 按 API.md 定义的消息类型
    # ------------------------------------------------------------------

    async def send_round_start(self, round_num: int) -> None:
        await self.send({
            "type": "round_start",
            "round": round_num,
            "total_rounds": self.total_rounds,
        })

    async def send_round_complete(self, round_num: int) -> None:
        await self.send({
            "type": "round_complete",
            "round": round_num,
        })

    async def send_official_thinking(self, official_id: str, name: str, round_num: int) -> None:
        await self.send({
            "type": "official_thinking",
            "official": official_id,
            "name": name,
            "round": round_num,
        })

    async def send_official_speech(
        self,
        official_id: str,
        name: str,
        rank: int,
        round_num: int,
        content: str,
    ) -> None:
        await self.send({
            "type": "official_speech",
            "official": official_id,
            "name": name,
            "rank": rank,
            "round": round_num,
            "content": content,
        })

    async def send_official_silent(self, official_id: str, name: str) -> None:
        await self.send({
            "type": "official_silent",
            "official": official_id,
            "name": name,
            "display_text": "臣无奏",
        })

    async def send_chancellor_summary(self, content: str) -> None:
        await self.send({
            "type": "chancellor_summary",
            "content": content,
        })

    async def send_debate_complete(self) -> None:
        await self.send({
            "type": "debate_complete",
            "debate_id": self.debate_id,
        })

    async def send_error(self, code: str, message: str) -> None:
        await self.send({
            "type": "error",
            "code": code,
            "message": message,
        })
