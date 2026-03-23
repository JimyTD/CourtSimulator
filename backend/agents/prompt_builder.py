"""
agents/prompt_builder.py — 构建官员发言的 messages 列表

注入内容（按顺序）：
1. 角色设定（officials.json 的 systemPrompt）
2. 品级关系说明（当前官员 rank vs 朝堂其他人）
3. 议题
4. 历史发言（第 2 轮起注入）
5. 发言长度约束（short≈100字 / medium≈200字 / long≈350字）
6. 文言文程度（modern / classical）
7. 可以输出 "SILENT" 表示沉默（品级差距大时使用）
"""
from __future__ import annotations

from agents.base import OfficialConfig

# 发言长度映射
LENGTH_MAP = {
    "short": "约 100 字以内",
    "medium": "约 200 字左右",
    "long": "约 350 字左右",
}

# 文言程度映射
STYLE_MAP = {
    "modern": "可以适当使用现代词汇，以文白夹杂为主，朝堂口吻即可",
    "classical": "尽量使用文言文，词句典雅，引经据典，避免现代白话",
}

# 沉默触发的品级差距阈值（比自己高出 N 级以上时，提示可沉默）
SILENCE_RANK_THRESHOLD = 3


def build_messages(
    config: OfficialConfig,
    context: dict,
    round_num: int,
) -> list[dict]:
    """
    构建 OpenAI 格式的 messages 列表。

    context 结构：
    {
        "topic": str,
        "history": [
            {
                "round": int,
                "speeches": [
                    {"official_id": str, "name": str, "rank": int, "content": str},
                    ...
                ]
            }
        ],
        "settings": {
            "length": "short" | "medium" | "long",
            "style":  "modern" | "classical",
        },
        "all_officials": [
            {"id": str, "name": str, "rank": int},
            ...
        ],
    }
    """
    system_content = _build_system(config, context, round_num)
    user_content = _build_user(context, round_num)

    return [
        {"role": "system", "content": system_content},
        {"role": "user", "content": user_content},
    ]


# ---------------------------------------------------------------------------
# 内部构建函数
# ---------------------------------------------------------------------------

def _build_system(config: OfficialConfig, context: dict, round_num: int) -> str:
    parts: list[str] = []

    # 1. 角色设定
    base_prompt = config.system_prompt or (
        f"你是朝中{config.name}，{config.title}。{config.personality}"
    )
    parts.append(base_prompt)

    # 2. 品级关系
    parts.append(_build_rank_context(config, context))

    # 5. 发言长度约束
    settings = context.get("settings", {})
    length_key = settings.get("length", "medium")
    length_desc = LENGTH_MAP.get(length_key, LENGTH_MAP["medium"])
    parts.append(f"【发言长度】本次发言请控制在{length_desc}。")

    # 6. 文言文程度
    style_key = settings.get("style", "modern")
    style_desc = STYLE_MAP.get(style_key, STYLE_MAP["modern"])
    parts.append(f"【语言风格】{style_desc}。")

    # 7. 沉默说明
    parts.append(_build_silence_hint(config, context, round_num))

    # 附加约束
    parts.append(
        "【格式要求】直接输出你的奏对内容，不要加任何前缀（如'臣奏'），"
        "不要用括号说明动作，只输出说话内容。"
        "如选择沉默，只输出英文大写字母 SILENT，不加任何其他文字。"
    )

    return "\n\n".join(parts)


def _build_user(context: dict, round_num: int) -> str:
    parts: list[str] = []

    # 3. 议题
    topic = context.get("topic", "（无议题）")
    parts.append(f"【今日议题】{topic}")

    # 4. 历史发言（第 2 轮起）
    history = context.get("history", [])
    if round_num > 1 and history:
        parts.append("【前轮朝堂发言记录】")
        for round_record in history:
            r = round_record.get("round", "?")
            parts.append(f"--- 第 {r} 轮 ---")
            for speech in round_record.get("speeches", []):
                name = speech.get("name", "某官员")
                content = speech.get("content", "（沉默）")
                parts.append(f"{name}：{content}")
        parts.append("")

    if round_num == 1:
        parts.append("请就此议题发表你的看法，奏对皇上。")
    else:
        parts.append(
            f"这是第 {round_num} 轮，请结合前轮各位的发言，"
            "发表你的回应或反驳，亦可沉默（输出 SILENT）。"
        )

    return "\n".join(parts)


def _build_rank_context(config: OfficialConfig, context: dict) -> str:
    """构建品级关系说明段落"""
    all_officials: list[dict] = context.get("all_officials", [])
    if not all_officials:
        return ""

    my_rank = config.rank
    higher: list[str] = []
    same: list[str] = []
    lower: list[str] = []

    for off in all_officials:
        if off.get("id") == config.id:
            continue
        other_rank = off.get("rank", 5)
        name = off.get("name", "某官")
        if other_rank < my_rank:       # 数字小 = 品级高
            higher.append(f"{name}（{other_rank}品）")
        elif other_rank == my_rank:
            same.append(f"{name}（{other_rank}品）")
        else:
            lower.append(f"{name}（{other_rank}品）")

    lines = [f"【品级关系】你是{my_rank}品官员。当前朝堂中："]
    if higher:
        lines.append(f"  品级高于你的官员：{'、'.join(higher)}——与其交流需适当恭敬。")
    if same:
        lines.append(f"  与你同品的官员：{'、'.join(same)}——可平等交流。")
    if lower:
        lines.append(f"  品级低于你的官员：{'、'.join(lower)}——可居高临下。")

    return "\n".join(lines)


def _build_silence_hint(config: OfficialConfig, context: dict, round_num: int) -> str:
    """生成沉默提示。第一轮不建议沉默；第二轮起，品级差距大时提示可沉默。"""
    if round_num <= 1:
        return "【沉默说明】第一轮请务必发言，不得沉默。"

    all_officials: list[dict] = context.get("all_officials", [])
    my_rank = config.rank

    # 检查是否有品级远高于自己的官员
    has_much_higher = any(
        (my_rank - off.get("rank", 5)) >= SILENCE_RANK_THRESHOLD
        for off in all_officials
        if off.get("id") != config.id
    )

    if has_much_higher:
        return (
            "【沉默说明】朝堂中有品级远高于你的大员。"
            "若你认为已无新意可奏、或不便与高品大员正面交锋，"
            "可选择沉默，此时仅输出 SILENT 即可。"
        )
    return (
        "【沉默说明】若你确实无话可说，可输出 SILENT；"
        "否则建议就前轮发言发表看法。"
    )
