"""
llm/fallback.py — Fallback 调用链

优先级：
  1. 用户传来的 Key（userKey）
  2. 服务端 DeepSeek V3（DEEPSEEK_API_KEY 环境变量）
  3. 服务端 GLM4-Flash（GLM4_API_KEY 环境变量，几乎无限免费，兜底）

捕获 RateLimitError / InsufficientQuotaError 自动降级。
"""
from __future__ import annotations

import asyncio
import os
import logging
from typing import AsyncIterator

from openai import AsyncOpenAI, RateLimitError, APIStatusError

from llm.client import make_client, PROVIDER_CONFIGS

logger = logging.getLogger(__name__)


class UserKey:
    """用户自带的 Key 配置（来自前端请求体）"""

    def __init__(
        self,
        provider: str,
        api_key: str,
        model: str | None = None,
        base_url: str | None = None,
    ):
        self.provider = provider
        self.api_key = api_key
        self.model = model
        self.base_url = base_url

    def to_client_kwargs(self) -> tuple[AsyncOpenAI, str]:
        """返回 (client, model_name)"""
        cfg = PROVIDER_CONFIGS.get(self.provider, {})
        base_url = self.base_url or cfg.get("base_url")
        model = self.model or cfg.get("default_model", "gpt-4o-mini")
        client = make_client(self.api_key, base_url)
        return client, model


def _is_quota_error(exc: Exception) -> bool:
    """判断是否为余额不足 / 频率超限错误"""
    if isinstance(exc, RateLimitError):
        return True
    if isinstance(exc, APIStatusError):
        # 部分提供商用 402 / 429 表示余额不足
        if exc.status_code in (402, 429):
            return True
        # 关键词匹配（GLM4 / DeepSeek 的错误 message）
        msg = str(exc).lower()
        if any(kw in msg for kw in ("quota", "insufficient", "balance", "rate limit")):
            return True
    return False


async def chat_with_fallback(
    messages: list[dict],
    *,
    user_key: UserKey | None = None,
    stream: bool = True,
    temperature: float = 0.85,
    max_tokens: int = 800,
) -> AsyncIterator[str]:
    """
    带 Fallback 的聊天调用，以 async generator 形式 yield 文本 token。

    Args:
        messages: OpenAI 格式的 messages 列表
        user_key: 用户自带 Key（可为 None）
        stream: 是否流式输出（默认 True）
        temperature: 采样温度
        max_tokens: 最大输出 token 数

    对于偶发的 JSON 解析错误（DeepSeek SSE 偶尔返回格式异常），
    同一 provider 会重试一次；重试仍失败则降级到下一个 provider。
    """
    import json as _json

    candidates = _build_candidates(user_key)

    last_exc: Exception | None = None
    for label, client, model in candidates:
        for attempt in range(1, _MAX_STREAM_RETRIES + 1):
            try:
                logger.info("LLM 调用: %s / %s (attempt %d)", label, model, attempt)
                async for token in _stream_call(
                    client, model, messages, temperature, max_tokens
                ):
                    yield token
                return  # 成功，退出
            except _json.JSONDecodeError as e:
                # 偶发 JSON 解析错误：可能已 yield 了部分 token
                # 但可以重试，调用侧应能处理部分内容
                logger.warning(
                    "LLM %s JSON 解析失败 (attempt %d/%d): %s",
                    label, attempt, _MAX_STREAM_RETRIES, e,
                )
                last_exc = e
                if attempt < _MAX_STREAM_RETRIES:
                    await asyncio.sleep(0.5)
                    continue
                else:
                    break  # 同一 provider 重试耗尽，尝试下一个
            except Exception as exc:
                if _is_quota_error(exc):
                    logger.warning("LLM %s 触发降级: %s", label, exc)
                    last_exc = exc
                    break  # 尝试下一个 provider
                else:
                    # 非配额非 JSON 错误直接抛出
                    raise

    # 所有候选都失败 — 不抛异常，返回空（调用侧会处理为 SILENT）
    logger.error("所有 LLM 提供商均不可用，最后一个错误: %s", last_exc)


def _build_candidates(
    user_key: UserKey | None,
) -> list[tuple[str, AsyncOpenAI, str]]:
    """构建按优先级排列的 (label, client, model) 列表"""
    candidates: list[tuple[str, AsyncOpenAI, str]] = []

    # 1. 用户自带 Key
    if user_key and user_key.api_key:
        try:
            client, model = user_key.to_client_kwargs()
            candidates.append(("user_key", client, model))
        except Exception as e:
            logger.warning("用户 Key 配置无效，跳过: %s", e)

    # 2. 服务端 DeepSeek
    deepseek_key = os.getenv("DEEPSEEK_API_KEY", "")
    if deepseek_key:
        cfg = PROVIDER_CONFIGS["deepseek"]
        candidates.append((
            "deepseek",
            make_client(deepseek_key, cfg["base_url"]),
            cfg["default_model"],
        ))

    # 3. 服务端 GLM4-Flash（兜底）
    glm4_key = os.getenv("GLM4_API_KEY", "")
    if glm4_key:
        cfg = PROVIDER_CONFIGS["glm4"]
        candidates.append((
            "glm4",
            make_client(glm4_key, cfg["base_url"]),
            cfg["default_model"],
        ))

    if not candidates:
        raise RuntimeError(
            "没有可用的 LLM Key。请在 .env 配置 DEEPSEEK_API_KEY 或 GLM4_API_KEY，"
            "或由前端传入 userKey。"
        )

    return candidates


_MAX_STREAM_RETRIES = 2  # 最多重试次数（偶发 JSON 解析错误）


async def _stream_call(
    client: AsyncOpenAI,
    model: str,
    messages: list[dict],
    temperature: float,
    max_tokens: int,
) -> AsyncIterator[str]:
    """
    执行流式调用，yield 文本 token。

    注意：async generator 一旦 yield 了 token 就不能回滚重试。
    因此 JSONDecodeError 重试逻辑在 chat_with_fallback 层处理，
    此处只做单次流式调用。
    """
    stream = await client.chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            yield delta.content
