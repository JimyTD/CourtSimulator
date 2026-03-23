"""
agents/prompt_builder.py — 构建官员发言的 messages 列表

注入内容（按顺序）：
1. 角色设定（officials.json 的 systemPrompt）
2. 首要约束（议题优先，高于职责限制）
3. 品级关系说明（当前官员 rank vs 朝堂其他人）
4. 议题 + 历史发言（第 2 轮起）+ 同轮已发言（第 2 轮起）
5. 发言长度约束（short≈100字 / medium≈200字 / long≈350字）
6. 文言文程度（modern / classical）
7. 沉默说明
8. 格式要求 + 禁止重复句式
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
    "modern": "请用现代白话文发言，说人话，不要用文言文、古文语气或古代称谓（如'臣''陛下''尔等'等），用正常现代中文口吻，带点职场感即可",
    "classical": "尽量使用文言文，词句典雅，引经据典，避免现代白话",
}

# 沉默触发的品级差距阈值（比自己高出 N 级以上时，提示可沉默）
SILENCE_RANK_THRESHOLD = 3


def build_messages(
    config: OfficialConfig,
    context: dict,
    round_num: int,
    same_round_speeches: list[dict] | None = None,
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

    same_round_speeches: 同轮中排在本官员之前已完成发言的列表
    （仅第 1 轮顺序发言时传入，并行模式不传）
    """
    system_content = _build_system(config, context, round_num)
    user_content = _build_user(context, round_num, same_round_speeches)

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

    # 2. 议题优先约束（高于职责限制）
    topic = context.get("topic", "")
    if topic:
        parts.append(
            f"【首要约束 - 优先级最高】\n"
            f"当前议题是：「{topic}」\n"
            f"你的一切发言必须紧扣此议题，从你的职位视角表达对该议题的明确立场（支持/反对/有条件支持）。\n"
            f"禁止回避议题、空谈职责、引入与此议题无关的话题。\n"
            f"你的职责限制服从于此约束——即使议题涉及你职权之外的领域，也必须从本职视角对该议题表态，而非拒绝发言。"
        )

    # 3. 品级关系
    parts.append(_build_rank_context(config, context))

    # 4. 发言长度约束
    settings = context.get("settings", {})
    length_key = settings.get("length", "medium")
    length_desc = LENGTH_MAP.get(length_key, LENGTH_MAP["medium"])
    parts.append(f"【发言长度】本次发言请控制在{length_desc}。")

    # 5. 文言文程度
    style_key = settings.get("style", "modern")
    style_desc = STYLE_MAP.get(style_key, STYLE_MAP["modern"])
    parts.append(f"【语言风格】{style_desc}。")

    # 6. 沉默说明
    parts.append(_build_silence_hint(config, context, round_num))

    # 7. 格式要求 + 禁止重复句式
    parts.append(
        "【格式要求】\n"
        "- 直接输出奏对内容，不要加任何前缀（如"臣奏""启禀陛下"），不要用括号说明动作。\n"
        "- 如选择沉默，只输出英文大写字母 SILENT，不加任何其他文字。\n"
        "- 【禁止重复】不得以"臣以为""臣认为""臣以为此事""依臣之见"等套话开头，"
        "也不得重复使用朝堂中其他官员已用过的开场句式。每位官员的发言开头必须独特，体现自身性格。"
    )

    return "\n\n".join(parts)


def _build_user(
    context: dict,
    round_num: int,
    same_round_speeches: list[dict] | None = None,
) -> str:
    parts: list[str] = []

    # 议题
    topic = context.get("topic", "（无议题）")
    parts.append(f"【今日议题】{topic}")

    # 历史发言（第 2 轮起注入前轮记录）
    history = context.get("history", [])
    if round_num > 1 and history:
        parts.append("【前轮朝堂发言记录】")
        for round_record in history:
            r = round_record.get("round", "?")
            parts.append(f"--- 第 {r} 轮 ---")
            for speech in round_record.get("speeches", []):
                name = speech.get("name", "某官员")
                content = speech.get("content", "（沉默）")
                if content == "SILENT":
                    content = "（沉默）"
                parts.append(f"{name}：{content}")
        parts.append("")

    # 同轮已发言（若有）
    if same_round_speeches:
        parts.append("【本轮朝堂中已有官员先行奏对，内容如下】")
        for speech in same_round_speeches:
            name = speech.get("name", "某官员")
            content = speech.get("content", "（沉默）")
            if content == "SILENT":
                content = "（沉默）"
            parts.append(f"{name}：{content}")
        parts.append("（以上为本轮他人发言，请勿重复相同观点或句式）")
        parts.append("")

    # 发言指令
    if round_num == 1:
        parts.append(
            "请就此议题发表你的看法，奏对皇上。\n"
            "【强制要求】\n"
            "1. 必须直接回应【今日议题】，明确表达立场（支持/反对/有条件支持），不得空谈职责套话。\n"
            "2. 论述须结合你的职位视角，说明该议题对你所掌管领域的具体影响或建议。\n"
            "3. 禁止引入与议题无关的话题。\n"
            "4. 开场句必须体现你的性格特点，不得与他人雷同。"
        )
    else:
        parts.append(
            f"这是第 {round_num} 轮，请结合前轮及本轮他人发言，发表你的回应或反驳，亦可沉默（输出 SILENT）。\n"
            "【强制要求】\n"
            "1. 回应必须紧扣【今日议题】，不得偏离主旨。\n"
            "2. 若反驳他人，须针对其关于该议题的具体观点展开，不得泛泛而谈。\n"
            "3. 禁止引入与议题无关的话题。\n"
            "4. 不得重复自己或他人在本轮/前轮已说过的观点，须有新的论据或角度。"
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
        if other_rank < my_rank:
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
