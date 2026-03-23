# 上朝模拟器（CourtSimulator）

多 Agent 朝会辩论应用。用户扮演皇帝，提出议题，朝中官员各持立场奏对，最终皇帝拍板。

## 目录结构

```
X:\CourtSimulator\
├── backend\              ← Python FastAPI
├── frontend\             ← React + Vite 5.x
├── shared\config\        ← 官员配置、UI 文案、游戏规则
├── docs\                 ← 正式文档
│   ├── dev-logs\         ← 临时开发记录
│   ├── DESIGN.md         ← 本文件：完整设计文档
│   ├── ARCHITECTURE.md   ← 系统架构
│   └── API.md            ← 接口文档
└── .codebuddy\rules\     ← AI 编程规则
```

## 文档索引

| 文档 | 内容 |
|------|------|
| [DESIGN.md](./DESIGN.md) | 产品设计、功能规格、决策记录 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统架构、数据流、模块说明 |
| [API.md](./API.md) | REST + WebSocket 接口规范 |
