"""
api/routes.py — REST 路由

端点：
  POST /api/debate/start    发起一次朝会
  GET  /api/officials       获取所有可用官员
  POST /api/officials/create  创建自定义官员（AI 润色 prompt）
  POST /api/officials/confirm 确认保存自定义官员
"""
from __future__ import annotations

import uuid
import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agents.loader import load_all_officials, invalidate_cache
from debate.engine import DebateConfig
from llm.fallback import UserKey, chat_with_fallback

logger = logging.getLogger(__name__)
router = APIRouter()

# 存储待确认的自定义官员（内存，P1 阶段可换 Redis）
_pending_customs: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Pydantic 模型
# ---------------------------------------------------------------------------

class DebateSettings(BaseModel):
    length: str = "medium"   # short / medium / long
    style: str = "modern"    # modern / classical


class UserKeyModel(BaseModel):
    provider: str = "deepseek"
    apiKey: str = ""
    model: str | None = None
    baseUrl: str | None = None


class StartDebateRequest(BaseModel):
    topic: str
    officials: list[str] = Field(default_factory=list)
    rounds: int = Field(default=2, ge=1, le=3)
    settings: DebateSettings = Field(default_factory=DebateSettings)
    userKey: UserKeyModel | None = None


class CreateOfficialRequest(BaseModel):
    name: str
    rank: int = Field(ge=1, le=9)
    personality: str = ""
    speakingStyle: str = ""


class ConfirmOfficialRequest(BaseModel):
    official_id: str
    accepted: bool


# ---------------------------------------------------------------------------
# 全局辩论任务注册表（debate_id → DebateConfig）
# 实际 WebSocket 启动引擎时从此读取配置
# ---------------------------------------------------------------------------
_debate_registry: dict[str, DebateConfig] = {}


def get_debate_config(debate_id: str) -> DebateConfig | None:
    return _debate_registry.get(debate_id)


# ---------------------------------------------------------------------------
# POST /debate/start
# ---------------------------------------------------------------------------

@router.post("/debate/start")
async def start_debate(req: StartDebateRequest):
    if not req.topic or not req.topic.strip():
        raise HTTPException(status_code=400, detail={
            "error": "topic_required",
            "message": "议题不能为空",
        })

    if not req.officials:
        raise HTTPException(status_code=400, detail={
            "error": "officials_required",
            "message": "至少需要选择一名官员",
        })

    # 构建 UserKey
    user_key: UserKey | None = None
    if req.userKey and req.userKey.apiKey:
        user_key = UserKey(
            provider=req.userKey.provider,
            api_key=req.userKey.apiKey,
            model=req.userKey.model,
            base_url=req.userKey.baseUrl,
        )

    debate_id = str(uuid.uuid4())
    config = DebateConfig(
        topic=req.topic.strip(),
        official_ids=req.officials,
        rounds=req.rounds,
        settings=req.settings.model_dump(),
        user_key=user_key,
    )
    _debate_registry[debate_id] = config

    logger.info("朝会发起: debate_id=%s topic=%s officials=%s",
                debate_id, config.topic, config.official_ids)
    return {"debate_id": debate_id, "status": "started"}


# ---------------------------------------------------------------------------
# GET /officials
# ---------------------------------------------------------------------------

@router.get("/officials")
async def get_officials():
    try:
        all_configs = load_all_officials()
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    officials_list = [
        {
            "id": cfg.id,
            "name": cfg.name,
            "title": cfg.title,
            "rank": cfg.rank,
            "faction": cfg.faction,
            "avatar": cfg.avatar,
            "isDefault": cfg.is_default,
        }
        for cfg in all_configs.values()
    ]
    return {"officials": officials_list}


# ---------------------------------------------------------------------------
# POST /officials/create  — AI 润色自定义官员 prompt
# ---------------------------------------------------------------------------

@router.post("/officials/create")
async def create_official(req: CreateOfficialRequest):
    """调用 LLM 将用户输入润色为标准 systemPrompt，返回预览供用户确认"""
    if not req.name.strip():
        raise HTTPException(status_code=400, detail={
            "error": "name_required",
            "message": "官员名称不能为空",
        })

    polish_prompt = _build_polish_prompt(req)
    messages = [
        {
            "role": "system",
            "content": (
                "你是一位古代角色扮演游戏设计师，擅长为官员角色撰写 system prompt。"
                "请将用户描述的官员信息，润色成一段简洁有力的角色设定（约 80-120 字），"
                "参考格式：你是[官职]，[一句话描述立场/性格]。[2-3句说话风格特征]。"
                "直接输出润色后的 prompt 文本，不加任何前缀或解释。"
            ),
        },
        {"role": "user", "content": polish_prompt},
    ]

    polished = ""
    try:
        async for token in chat_with_fallback(messages, stream=True, max_tokens=300):
            polished += token
    except Exception as exc:
        raise HTTPException(status_code=503, detail={
            "error": "llm_unavailable",
            "message": f"AI 服务暂时不可用：{exc}",
        })

    official_id = f"custom_{uuid.uuid4().hex[:8]}"
    _pending_customs[official_id] = {
        "id": official_id,
        "name": req.name,
        "rank": req.rank,
        "personality": req.personality,
        "systemPrompt": polished.strip(),
        "avatar": "",
        "faction": "custom",
        "isDefault": False,
    }

    return {
        "official_id": official_id,
        "name": req.name,
        "rank": req.rank,
        "systemPrompt": polished.strip(),
        "preview": polished.strip(),
    }


def _build_polish_prompt(req: CreateOfficialRequest) -> str:
    parts = [f"官职：{req.name}（{req.rank}品）"]
    if req.personality:
        parts.append(f"性格特点：{req.personality}")
    if req.speakingStyle:
        parts.append(f"说话风格：{req.speakingStyle}")
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# POST /officials/confirm
# ---------------------------------------------------------------------------

@router.post("/officials/confirm")
async def confirm_official(req: ConfirmOfficialRequest):
    pending = _pending_customs.get(req.official_id)
    if not pending:
        raise HTTPException(status_code=404, detail={
            "error": "not_found",
            "message": "未找到待确认的自定义官员",
        })

    if req.accepted:
        # TODO P1: 持久化到文件或数据库
        # 现阶段保存到内存中，重启后消失
        # invalidate_cache() 在写入 officials.json 后调用
        logger.info("自定义官员已确认: %s", req.official_id)
        _pending_customs.pop(req.official_id, None)
        return {"status": "saved", "official_id": req.official_id}
    else:
        _pending_customs.pop(req.official_id, None)
        return {"status": "discarded", "official_id": req.official_id}
