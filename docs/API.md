# API 文档 · 上朝模拟器

> 最后更新：2026-03-23
> 基础路径：`http://localhost:8000`

---

## 一、REST API

### POST `/api/debate/start`

发起一次朝会辩论。

**Request Body**

```json
{
  "topic": "西北用兵，如何应对？",
  "officials": ["hubu", "bingbu", "libu", "gongbu", "yushi", "hanlin"],
  "rounds": 2,
  "settings": {
    "length": "medium",
    "style": "modern"
  },
  "userKey": {
    "provider": "deepseek",
    "apiKey": "sk-xxx",
    "model": "deepseek-chat",
    "baseUrl": ""
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| topic | string | ✅ | 议题内容 |
| officials | string[] | ✅ | 参与官员 ID 列表 |
| rounds | int | ❌ | 辩论轮次，默认 2，范围 1-3 |
| settings.length | enum | ❌ | `short`/`medium`/`long`，默认 `medium` |
| settings.style | enum | ❌ | `modern`/`classical`，默认 `modern` |
| userKey | object | ❌ | 用户自带 Key，不传则用服务端默认 |

**Response 200**

```json
{
  "debate_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "started"
}
```

**Response 400**

```json
{
  "error": "topic_required",
  "message": "议题不能为空"
}
```

---

### GET `/api/officials`

获取所有可用官员列表（默认 + 用户自定义）。

**Response 200**

```json
{
  "officials": [
    {
      "id": "hubu",
      "name": "户部尚书",
      "title": "掌管天下钱粮",
      "rank": 2,
      "faction": "conservative",
      "avatar": "hubu.png",
      "isDefault": true
    }
  ]
}
```

---

### POST `/api/officials/create`

创建自定义官员（用户封官）。

**Request Body**

```json
{
  "name": "总统",
  "rank": 5,
  "personality": "雷厉风行，喜欢民主",
  "speakingStyle": "说话直接，不绕弯子"
}
```

**Response 200**

```json
{
  "official_id": "custom_xxx",
  "name": "总统",
  "rank": 5,
  "systemPrompt": "你是朝中五品总统大人...",
  "preview": "（AI 润色后的 prompt 预览）"
}
```

说明：后端调用 LLM 将用户输入润色成标准 prompt，返回预览供用户确认。

---

### POST `/api/officials/confirm`

确认保存自定义官员。

**Request Body**

```json
{
  "official_id": "custom_xxx",
  "accepted": true
}
```

---

## 二、WebSocket

### `WS /ws/debate/{debate_id}`

连接到指定辩论的实时推流。

**连接后服务端推送的消息类型：**

---

#### `round_start` — 轮次开始

```json
{
  "type": "round_start",
  "round": 1,
  "total_rounds": 2
}
```

---

#### `official_thinking` — 官员正在思考

```json
{
  "type": "official_thinking",
  "official": "hubu",
  "name": "户部尚书",
  "round": 1
}
```

---

#### `official_speech` — 官员发言完成（触发打字机）

```json
{
  "type": "official_speech",
  "official": "hubu",
  "name": "户部尚书",
  "rank": 2,
  "round": 1,
  "content": "臣以为，西北用兵，耗费甚巨，国库难以为继..."
}
```

---

#### `official_silent` — 官员沉默

```json
{
  "type": "official_silent",
  "official": "xiaoguanli",
  "name": "小官吏",
  "display_text": "臣无奏"
}
```

---

#### `round_complete` — 本轮结束

```json
{
  "type": "round_complete",
  "round": 1
}
```

---

#### `chancellor_summary` — 丞相总结（所有轮次结束后）

```json
{
  "type": "chancellor_summary",
  "content": "综各位所奏，争议焦点在于..."
}
```

---

#### `debate_complete` — 辩论结束

```json
{
  "type": "debate_complete",
  "debate_id": "550e8400-..."
}
```

---

#### `error` — 错误

```json
{
  "type": "error",
  "code": "llm_unavailable",
  "message": "AI 服务暂时不可用，请稍后重试"
}
```

---

## 三、P1 预留接口（尚未实现）

### 皇帝追问（客户端 → 服务端）

```json
{
  "type": "emperor_query",
  "target": "hubu",
  "question": "户部尚书，具体亏空几何？"
}
```

### 皇帝打断（客户端 → 服务端）

```json
{
  "type": "emperor_interrupt"
}
```

服务端响应：

```json
{
  "type": "debate_interrupted",
  "message": "朕意已决，退朝。"
}
```
