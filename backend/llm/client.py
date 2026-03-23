"""
llm/client.py — 统一 LLM 调用接口（OpenAI 兼容模式）

支持：
- DeepSeek V3  (base_url="https://api.deepseek.com")
- GLM4-Flash   (base_url="https://open.bigmodel.cn/api/paas/v4/")
- 用户自带 Key  (任意 OpenAI 兼容接口)
"""
from __future__ import annotations

from openai import AsyncOpenAI


def make_client(api_key: str, base_url: str | None = None) -> AsyncOpenAI:
    """
    创建 AsyncOpenAI 客户端。

    Args:
        api_key: 鉴权 Key
        base_url: 自定义 base URL；None 则使用 OpenAI 官方地址（一般不用）
    """
    kwargs: dict = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return AsyncOpenAI(**kwargs)


# 预置提供商配置
PROVIDER_CONFIGS: dict[str, dict] = {
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "default_model": "deepseek-chat",
    },
    "glm4": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4/",
        "default_model": "glm-4-flash",
    },
    "openai": {
        "base_url": None,
        "default_model": "gpt-4o-mini",
    },
}
