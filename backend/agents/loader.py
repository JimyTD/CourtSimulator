"""
agents/loader.py - 从 officials.json 加载官员配置

officials.json 路径：../shared/config/officials.json
（相对于 backend 目录，即 X:\\CourtSimulator\\shared\\config\\officials.json）
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any

from agents.base import OfficialAgent, OfficialConfig

# 配置文件路径（相对于本文件所在目录向上两级 → shared/config/）
_HERE = os.path.dirname(os.path.abspath(__file__))
_OFFICIALS_JSON = os.path.normpath(
    os.path.join(_HERE, "..", "..", "shared", "config", "officials.json")
)


@lru_cache(maxsize=1)
def _load_raw() -> dict[str, Any]:
    """读取并缓存 officials.json 原始数据"""
    if not os.path.exists(_OFFICIALS_JSON):
        raise FileNotFoundError(
            f"officials.json 未找到，期望路径: {_OFFICIALS_JSON}"
        )
    with open(_OFFICIALS_JSON, encoding="utf-8") as f:
        return json.load(f)


def load_all_officials() -> dict[str, OfficialConfig]:
    """
    返回所有官员的配置字典，key = official_id。
    """
    raw = _load_raw()
    officials_raw: dict[str, Any] = raw.get("officials", {})

    result: dict[str, OfficialConfig] = {}
    for oid, data in officials_raw.items():
        result[oid] = _parse_config(oid, data)
    return result


def load_selected_officials(official_ids: list[str]) -> list[OfficialAgent]:
    """
    按 ID 列表加载官员，返回 OfficialAgent 列表。
    未找到的 ID 会被忽略并记录警告。
    """
    import logging
    logger = logging.getLogger(__name__)

    all_configs = load_all_officials()
    agents: list[OfficialAgent] = []
    for oid in official_ids:
        if oid in all_configs:
            agents.append(OfficialAgent(all_configs[oid]))
        else:
            logger.warning("官员 ID 未找到，已忽略: %s", oid)
    return agents


def _parse_config(oid: str, data: dict) -> OfficialConfig:
    return OfficialConfig(
        id=oid,
        name=data.get("name", oid),
        title=data.get("title", ""),
        rank=int(data.get("rank", 5)),
        personality=data.get("personality", ""),
        system_prompt=data.get("systemPrompt", ""),
        avatar=data.get("avatar", ""),
        faction=data.get("faction", ""),
        is_default=data.get("isDefault", True),
        extra={k: v for k, v in data.items() if k not in {
            "name", "title", "rank", "personality",
            "systemPrompt", "avatar", "faction", "isDefault",
        }},
    )


def invalidate_cache():
    """清除配置缓存（自定义官员创建后调用）"""
    _load_raw.cache_clear()


def create_custom_agent(data) -> OfficialAgent:
    """根据前端传来的自定义官员数据，动态创建 OfficialAgent"""
    config = OfficialConfig(
        id=data.id,
        name=data.name,
        title=data.title,
        rank=data.rank,
        personality=data.personality,
        system_prompt="",  # 留空，由 prompt_builder 用 personality 生成
        avatar="",
        faction="",
        is_default=False,
    )
    return OfficialAgent(config)
