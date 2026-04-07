"""
agents/prompt_builder.py — 构建官员发言的 messages 列表

设计原则：
- 官职 = 性格倾向标签，不是职责边界。所有大臣可以讨论任何话题。
- 每位大臣的目标是：说服皇上采纳自己的方案。
- 辩论需要对抗性：大臣之间要互相质疑、反驳、争夺最终结论。
- 品级只影响说话语气和自信程度，不限制发言权。
- 最终需要收敛到一个可执行的答案，不是各说各的。

注入内容（按顺序）：
1. 角色设定（officials.json 的 systemPrompt）
2. 场景说明（这是模拟朝堂讨论，官职代表性格倾向）
3. 议题约束
4. 品级关系（仅影响语气）
5. 发言长度
6. 语言风格
7. 对抗性引导 + 争夺结论
8. 沉默说明
9. 格式要求
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
    "modern": (
        "【重要】你必须用现代白话文发言。具体要求：\n"
        "- 禁止使用文言文词汇和句式（如'臣''陛下''尔等''甚矣''岂非''此乃''实乃''窃以为''依臣之见'等）\n"
        "- 禁止使用古代称谓和敬语套话（如'启禀''奏请''微臣''下官''圣上'等）\n"
        "- 用现代职场口吻说话，就像在开一个正式会议\n"
        "- 可以用'我认为''我的看法是''这个方案'这样的现代表达\n"
        "- 称呼其他人用职位名即可（如'户部那边''工部的意见'）\n"
        "- 语气正式但不拘谨，像一个专业人士在做汇报"
    ),
    "classical": "尽量使用文言文，词句典雅，引经据典，避免现代白话",
}


def build_messages(
    config: OfficialConfig,
    context: dict,
    round_num: int,
    same_round_speeches: list[dict] | None = None,
    web_search: bool = False,
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
                    {"official_id": str, "title": str, "rank": int, "content": str},
                    ...
                ]
            }
        ],
        "settings": {
            "length": "short" | "medium" | "long",
            "style":  "modern" | "classical",
        },
        "all_officials": [
            {"id": str, "title": str, "rank": int},
            ...
        ],
    }

    same_round_speeches: 同轮中排在本官员之前已完成发言的列表
    """
    system_content = _build_system(config, context, round_num, web_search=web_search)
    user_content = _build_user(config, context, round_num, same_round_speeches)

    return [
        {"role": "system", "content": system_content},
        {"role": "user", "content": user_content},
    ]


# ---------------------------------------------------------------------------
# 内部构建函数
# ---------------------------------------------------------------------------

def _build_system(config: OfficialConfig, context: dict, round_num: int, *, web_search: bool = False) -> str:
    parts: list[str] = []

    # 1. 角色设定
    base_prompt = config.system_prompt or (
        f"你是一个性格像{config.title}的人。{config.personality}"
    )
    parts.append(base_prompt)

    # 1.5 联网搜索引导（web_search 开启时追加）
    if web_search:
        parts.append(
            "【联网查阅】你拥有查阅最新时事资讯的能力。"
            "如果议题涉及时事热点、近期事件、政策法规、社会现象等，"
            "你必须先查阅最新资料再发言，引用具体的新闻事件、数据或政策内容来支撑你的观点。"
            "不要凭记忆编造，用真实的信息来增强说服力。"
        )

    # 2. 场景说明（关键！让 LLM 理解官职 = 性格标签）
    parts.append(
        "【重要说明】这是一个模拟朝堂讨论的场景。"
        "你的官职只代表你的性格倾向和思维方式，不限制你能讨论什么话题。"
        "无论议题是什么（哪怕是日常琐事），你都要用你的性格特点来给出建议。"
        "比如：如果议题是'今晚吃什么'，你不应该拒绝讨论或强行往本职工作上扯，"
        "而是用你的性格来回答——抠门的人会说'吃便宜的就行'，"
        "豪爽的人会说'大口吃肉'，守旧的人会说'按老规矩来'。"
    )

    # 3. 议题约束
    topic = context.get("topic", "")
    if topic:
        parts.append(
            f"【议题】当前讨论的问题是：「{topic}」\n"
            f"你的发言必须紧扣此议题，给出你的明确建议或立场。"
        )

    # 4. 品级关系（仅影响语气，不限制发言）
    rank_hint = _build_rank_context(config, context)
    if rank_hint:
        parts.append(rank_hint)

    # 5. 发言长度
    settings = context.get("settings", {})
    length_key = settings.get("length", "medium")
    length_desc = LENGTH_MAP.get(length_key, LENGTH_MAP["medium"])
    parts.append(f"【发言长度】本次发言请控制在{length_desc}。")

    # 6. 语言风格
    style_key = settings.get("style", "modern")
    style_desc = STYLE_MAP.get(style_key, STYLE_MAP["modern"])
    parts.append(f"【语言风格】{style_desc}。")

    # 7. 对抗性引导 + 争夺结论
    parts.append(
        "【核心目标】这场讨论最终需要得出一个结论供皇上采纳。"
        "你的目标是说服大家接受你的方案。\n"
        "- 如果你不同意别人的方案，要明确说出你反对的理由，可以点名反驳。\n"
        "- 如果你同意某人的方案，也要说清楚为什么，并补充你的角度。\n"
        "- 不要和稀泥，不要说'各有道理'这种废话。要有明确的立场和态度。\n"
        "- 你要争取让你的方案成为最终被采纳的那一个。"
    )

    # 8. 沉默说明
    parts.append(_build_silence_hint(round_num))

    # 9. 格式要求
    parts.append(
        "【格式要求】\n"
        "- 直接输出发言内容，不要加任何前缀套话，不要用括号说明动作。\n"
        "- 如选择沉默，只输出英文大写字母 SILENT，不加任何其他文字。\n"
        "- 发言开头要体现你的性格特点，不得与其他人雷同。"
    )

    return "\n\n".join(parts)


def _build_user(
    config: OfficialConfig,
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
        parts.append("【前轮发言记录】")
        for round_record in history:
            r = round_record.get("round", "?")
            parts.append(f"--- 第 {r} 轮 ---")
            for speech in round_record.get("speeches", []):
                title = speech.get("title", "某官员")
                content = speech.get("content", "（沉默）")
                if content == "SILENT":
                    content = "（沉默）"
                parts.append(f"{title}：{content}")
        parts.append("")

    # 同轮已发言（若有）
    if same_round_speeches:
        parts.append("【本轮其他人已经说了】")
        for speech in same_round_speeches:
            title = speech.get("title", "某官员")
            content = speech.get("content", "（沉默）")
            if content == "SILENT":
                content = "（沉默）"
            parts.append(f"{title}：{content}")
        parts.append("")

    # 发言指令（根据轮次不同，引导不同的对抗强度）
    if round_num == 1:
        parts.append(
            "现在轮到你发言。\n"
            "【要求】\n"
            "1. 针对议题给出你的明确建议——你觉得应该怎么办？\n"
            "2. 用你自己的性格和思维方式来回答，不要只念职责。\n"
            "3. 如果前面已有人发言，且你不同意，直接说出来并给出你的理由。\n"
            "4. 你的目标是提出一个让皇上觉得靠谱的方案。"
        )
    else:
        parts.append(
            f"这是第 {round_num} 轮讨论。\n"
            "【要求】\n"
            "1. 回顾前面所有人的发言，找出你最不同意的观点，直接反驳——说清楚哪里有问题。\n"
            "2. 如果你的方案被别人质疑了，要正面回应，不能装没听到。\n"
            "3. 如果你发现某人的方案确实比你的好，可以转而支持，但要说清楚为什么改变了看法。\n"
            "4. 不要重复上一轮自己说过的话，要有新的论据或者回应新的质疑。\n"
            "5. 记住：这场讨论要得出结论，你要推动讨论往你认为对的方向走。"
        )

    return "\n".join(parts)


def _build_rank_context(config: OfficialConfig, context: dict) -> str:
    """构建品级关系说明——仅影响说话语气，不限制发言权"""
    all_officials: list[dict] = context.get("all_officials", [])
    if not all_officials:
        return ""

    my_rank = config.rank
    others = [
        off for off in all_officials
        if off.get("id") != config.id
    ]
    if not others:
        return ""

    lines = [
        f"【说话语气参考】你是{my_rank}品官员。"
        f"品级只影响你说话的语气和自信程度，不影响你能否发言或发言内容。"
    ]

    higher = [off.get("title", "某官") for off in others if off.get("rank", 5) < my_rank]
    lower = [off.get("title", "某官") for off in others if off.get("rank", 5) > my_rank]

    if higher:
        lines.append(
            f"  对{'/'.join(higher)}说话时语气可以稍微客气些，但观点该反驳照样反驳。"
        )
    if lower:
        lines.append(
            f"  对{'/'.join(lower)}说话时可以更自信直接，但不要因为品级高就不讲理。"
        )

    return "\n".join(lines)


def _build_silence_hint(round_num: int) -> str:
    """生成沉默提示。第一轮必须发言；后续轮次只有真的完全无话可说才沉默。"""
    if round_num <= 1:
        return "【沉默说明】第一轮每个人都必须发言，不得沉默。"

    return (
        "【沉默说明】如果你确实已经没有任何新内容要说（既不需要反驳别人，"
        "自己的观点也不需要补充），可以输出 SILENT 表示沉默。"
        "但只要有任何想回应的，就应该继续发言。"
    )
