# 系统架构 · 上朝模拟器

> 最后更新：2026-03-23

---

## 一、整体架构

```
┌─────────────────────────────────────────────┐
│                  客户端                       │
│                                             │
│   浏览器（React + Vite）                     │
│   安卓（WebView 套壳，P2）                   │
└──────────────┬──────────────────────────────┘
               │ HTTP REST + WebSocket
┌──────────────▼──────────────────────────────┐
│               后端（Python FastAPI）          │
│                                             │
│  ┌─────────────┐    ┌─────────────────────┐  │
│  │  REST API   │    │   WebSocket Server  │  │
│  │ /debate/start│   │ /ws/debate/{id}     │  │
│  └──────┬──────┘    └──────────┬──────────┘  │
│         │                     │             │
│  ┌──────▼─────────────────────▼──────────┐  │
│  │           辩论引擎（DebateEngine）      │  │
│  │                                       │  │
│  │  并行调用 → 收集 → 推流 → 下一轮      │  │
│  └──────────────────┬────────────────────┘  │
│                     │                       │
│  ┌──────────────────▼────────────────────┐  │
│  │         官员 Agent 层                  │  │
│  │  OfficialAgent × N（并行）             │  │
│  └──────────────────┬────────────────────┘  │
│                     │                       │
│  ┌──────────────────▼────────────────────┐  │
│  │         LLM 调用层（带 Fallback）       │  │
│  │  用户 Key → DeepSeek → GLM4-Flash     │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│               外部 LLM API                   │
│   DeepSeek V3 / GLM4-Flash / 用户自带        │
└─────────────────────────────────────────────┘
```

---

## 二、目录结构

```
X:\CourtSimulator\
│
├── backend\
│   ├── main.py                  ← FastAPI 入口，路由注册
│   ├── .env                     ← API Keys（不提交 git）
│   ├── requirements.txt
│   │
│   ├── debate\
│   │   ├── __init__.py
│   │   ├── engine.py            ← 辩论引擎（并行调用、轮次管理）
│   │   └── streaming.py         ← WebSocket 推流管理
│   │
│   ├── agents\
│   │   ├── __init__.py
│   │   ├── base.py              ← OfficialAgent 基类
│   │   ├── loader.py            ← 从 officials.json 加载角色
│   │   └── prompt_builder.py   ← 构建 prompt（注入品级、轮次上下文）
│   │
│   ├── llm\
│   │   ├── __init__.py
│   │   ├── client.py            ← 统一 LLM 调用接口（OpenAI 兼容）
│   │   └── fallback.py          ← Fallback 链：用户Key → DeepSeek → GLM4
│   │
│   └── api\
│       ├── __init__.py
│       ├── routes.py            ← REST 路由（/debate/start 等）
│       └── ws.py                ← WebSocket 路由
│
├── frontend\
│   ├── package.json             ← Vite 5.x，React 18.x（版本锁定）
│   ├── vite.config.ts
│   │
│   └── src\
│       ├── main.tsx
│       ├── App.tsx
│       │
│       ├── components\
│       │   ├── CourtRoom.tsx       ← 朝堂主界面（布局容器）
│       │   ├── OfficialCard.tsx    ← 单个官员发言卡片（含打字机）
│       │   ├── EmperorInput.tsx    ← 皇帝输入议题
│       │   ├── ImperialDecree.tsx  ← 皇帝拍板区域
│       │   ├── ChancellorSummary.tsx ← 丞相总结
│       │   └── SettingsPanel.tsx   ← 设置面板（含 AI 配置）
│       │
│       ├── hooks\
│       │   ├── useDebate.ts        ← WebSocket 连接、消息处理
│       │   └── useSettings.ts      ← 设置读写（localStorage）
│       │
│       ├── store\
│       │   └── debateStore.ts      ← 全局状态（Zustand 或 Context）
│       │
│       └── types\
│           └── index.ts            ← 共享类型定义
│
├── shared\
│   └── config\
│       ├── officials.json          ← 官员角色配置
│       ├── ui-text.json            ← 界面文案
│       └── game-config.json        ← 游戏规则配置
│
└── docs\
    ├── DESIGN.md                   ← 产品设计文档
    ├── ARCHITECTURE.md             ← 本文件
    ├── API.md                      ← 接口文档
    └── dev-logs\                   ← 临时开发记录
```

---

## 三、数据流详解

### 3.1 发起一次朝会

```
1. 前端 POST /api/debate/start
   body: {
     topic: "西北用兵",
     rounds: 2,
     officials: ["hubu", "bingbu", ...],
     settings: { length: "medium", style: "modern" },
     userKey: { provider: "deepseek", key: "sk-xxx", model: "deepseek-chat" }
   }

2. 后端返回:
   { debate_id: "uuid-xxx" }

3. 前端立刻建立 WebSocket:
   WS /ws/debate/uuid-xxx

4. 后端异步执行辩论，通过 WS 推送事件
```

### 3.2 WebSocket 消息协议

```jsonc
// 官员开始发言（前端显示"正在思考..."）
{ "type": "official_thinking", "official": "hubu", "name": "户部尚书" }

// 官员发言完成（完整文本，前端开始打字机）
{
  "type": "official_speech",
  "official": "hubu",
  "name": "户部尚书",
  "rank": 2,
  "round": 1,
  "content": "臣以为，西北用兵，耗费甚巨..."
}

// 官员沉默
{ "type": "official_silent", "official": "xiaoguanli", "name": "小官吏", "reason": "rank_intimidated" }

// 轮次切换
{ "type": "round_start", "round": 2 }

// 丞相总结
{ "type": "chancellor_summary", "content": "综各位所奏..." }

// 辩论结束
{ "type": "debate_complete" }
```

### 3.3 辩论引擎内部流程

```python
async def run_debate(debate_id, config):
    context = { "topic": config.topic, "history": [] }

    for round_num in range(1, config.rounds + 1):
        await ws.broadcast({ "type": "round_start", "round": round_num })

        # 并行调用所有官员
        tasks = [agent.speak(context, round_num) for agent in active_officials]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # 逐个推送结果（谁先好谁先推）
        for agent, result in zip(active_officials, results):
            if result == SILENT:
                await ws.send_silent(agent)
            else:
                await ws.send_speech(agent, result, round_num)

        # 把本轮发言加入 context，供下一轮使用
        context["history"].append({ "round": round_num, "speeches": results })

    # 触发丞相总结
    summary = await chancellor.summarize(context)
    await ws.send_summary(summary)
    await ws.send({ "type": "debate_complete" })
```

---

## 四、关键技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 后端框架 | FastAPI | 原生 async，适合并行 LLM 调用 |
| 前端框架 | React 18 + Vite **5.x**（版本锁定） | Vite 6 有 CJS React 兼容性 bug |
| 实时通信 | WebSocket | 双向通信，支持后续皇帝打断功能；安卓兼容性好 |
| 状态管理 | Zustand（推荐）或 Context | 朝会状态复杂，Context 可能不够用 |
| LLM SDK | openai Python SDK（兼容模式） | DeepSeek/GLM4/Gemini 均支持 OpenAI 格式 |
| API Key 存储 | localStorage（用户 Key）+ .env（服务端 Key） | 用户 Key 不过后端，安全 |

---

## 五、P1 架构预留

### 皇帝追问（点名）

WebSocket 双向：前端发送 `{ "type": "emperor_query", "target": "hubu", "question": "..." }`
后端单独调用该官员，推送回复。

### 皇帝打断

前端发送 `{ "type": "emperor_interrupt" }`，后端取消当前轮次剩余 LLM 调用（asyncio task cancel），推送 `{ "type": "debate_interrupted" }`。

### 历史记录持久化

当前朝会数据结构已设计好，P1 阶段加 SQLite 或 PostgreSQL 落库即可，接口不变。

### IP 限流

```python
# TODO P2: 在此处插入限流逻辑
# from slowapi import Limiter
# @limiter.limit("10/day")
async def start_debate(request: Request, ...):
    ...
```
