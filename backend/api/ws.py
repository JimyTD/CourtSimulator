"""
api/ws.py — WebSocket 路由

端点：WS /ws/debate/{debate_id}

连接建立后：
1. 从注册表取出 DebateConfig
2. 创建 DebateStreamer
3. 在后台 Task 中启动 DebateEngine.run()
4. 同时监听客户端消息（P1 皇帝追问/打断预留）

连接断开时取消后台 Task，避免 LLM 资源浪费。
"""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from api.routes import get_debate_config
from debate.engine import DebateEngine
from debate.streaming import DebateStreamer

logger = logging.getLogger(__name__)
ws_router = APIRouter()


@ws_router.websocket("/ws/debate/{debate_id}")
async def websocket_debate(websocket: WebSocket, debate_id: str):
    await websocket.accept()
    logger.info("WebSocket 连接建立: %s", debate_id)

    config = get_debate_config(debate_id)
    if config is None:
        await websocket.send_text(json.dumps({
            "type": "error",
            "code": "debate_not_found",
            "message": f"找不到辩论 ID: {debate_id}，请先调用 /api/debate/start",
        }, ensure_ascii=False))
        await websocket.close()
        return

    streamer = DebateStreamer(websocket, debate_id, config.rounds)
    engine = DebateEngine(config, streamer)

    # 启动辩论引擎后台任务
    debate_task = asyncio.create_task(engine.run(), name=f"debate-{debate_id}")

    try:
        # 同时监听客户端消息（P1 皇帝追问/打断预留）
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=0.5)
                await _handle_client_message(raw, debate_task, streamer)
            except asyncio.TimeoutError:
                # 无客户端消息，检查辩论是否已结束
                if debate_task.done():
                    # 辩论正常结束（或出错），退出循环
                    if debate_task.exception():
                        logger.error(
                            "辩论任务异常 [%s]: %s",
                            debate_id, debate_task.exception()
                        )
                    break
            except WebSocketDisconnect:
                logger.info("WebSocket 客户端断开: %s", debate_id)
                break

    finally:
        if not debate_task.done():
            debate_task.cancel()
            try:
                await debate_task
            except (asyncio.CancelledError, Exception):
                pass
        logger.info("WebSocket 连接结束: %s", debate_id)


async def _handle_client_message(
    raw: str,
    debate_task: asyncio.Task,
    streamer: DebateStreamer,
) -> None:
    """
    处理客户端主动发来的消息（P1 功能预留）。

    目前支持：
      {"type": "emperor_interrupt"}  → 取消辩论任务
      {"type": "emperor_query", ...} → TODO P1
    """
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("收到非 JSON 消息: %s", raw)
        return

    msg_type = msg.get("type")

    if msg_type == "emperor_interrupt":
        logger.info("皇帝打断辩论: %s", streamer.debate_id)
        if not debate_task.done():
            debate_task.cancel()
        await streamer.send({
            "type": "debate_interrupted",
            "message": "朕意已决，退朝。",
        })

    elif msg_type == "emperor_query":
        # TODO P1: 皇帝追问，单独调用目标官员
        logger.info("皇帝追问（P1 未实现）: %s", msg)
        await streamer.send({
            "type": "error",
            "code": "not_implemented",
            "message": "皇帝追问功能将在 P1 版本实现",
        })

    else:
        logger.debug("未知客户端消息类型: %s", msg_type)
