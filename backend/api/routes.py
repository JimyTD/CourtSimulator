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


class CustomOfficialData(BaseModel):
    id: str
    name: str
    title: str
    rank: int
    personality: str  # 性格描述，用于构建 system prompt


class StartDebateRequest(BaseModel):
    topic: str
    officials: list[str] = Field(default_factory=list)
    rounds: int = Field(default=2, ge=1, le=3)
    settings: DebateSettings = Field(default_factory=DebateSettings)
    userKey: UserKeyModel | None = None
    custom_officials: list[CustomOfficialData] = Field(default_factory=list)  # 新增，默认空列表


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
        custom_officials=req.custom_officials,  # 新增：传入自定义官员列表
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
                "你是一位角色扮演游戏设计师，擅长为讨论角色撰写性格设定。\n"
                "用户会描述一个角色的官职和性格。请将其润色为一段角色设定（约 100-150 字）。\n\n"
                "核心原则：官职只代表性格倾向和思维方式，不限制角色能讨论什么话题。\n"
                "角色设定必须包含三部分：\n"
                "1. 一句话说明这是什么性格的人（官职只是性格标签）\n"
                "2. 核心性格特点和说话风格（2-3句）\n"
                "3. 对抗倾向——这个角色最看不惯什么样的观点，会跟什么样的人对着干\n\n"
                "参考格式：'你是一个[性格特点]的人。你的官职是[官职]，但这只代表你的性格倾向——"
                "[性格描述]。你最看不惯[对抗目标]。'\n"
                "直接输出润色后的文本，不加任何前缀或解释。"
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
    parts = [f"角色官职：{req.name}（{req.rank}品）"]
    if req.personality:
        parts.append(f"性格倾向：{req.personality}")
    if req.speakingStyle:
        parts.append(f"说话风格：{req.speakingStyle}")
    parts.append("注意：官职只是性格标签，这个角色需要能讨论任何话题，不要限制在某个职责范围内。")
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
