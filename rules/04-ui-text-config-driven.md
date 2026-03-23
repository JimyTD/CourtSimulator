---
description: 文案配置驱动规则 - 所有 UI 文本从配置读取，严禁硬编码
alwaysApply: false
enabled: true
---

# 文案配置驱动规则（术语/i18n）

## 📌 核心原则

**所有 UI 文案、提示消息、按钮文本等必须从配置文件读取，严禁硬编码！**

---

## 🎯 适用范围

### ✅ 必须从配置读取的内容

- 所有前端页面的 UI 文本（Web、移动端）
- 所有提示消息、错误提示、警告信息
- 按钮文本、导航标签、菜单项
- 表单标签、占位符、帮助文本
- 状态显示、评价系统、排行榜标题
- 成就、等级称号、段位名称
- 空状态提示、加载提示

### ❌ 禁止硬编码的做法

```javascript
// ❌ 错误示例 1：直接硬编码
Text("立Flag")
button.textContent = "我的任务"
alert("任务创建成功")
<span>薯条总数</span>

// ❌ 错误示例 2：混用硬编码和配置
Text(T.task.create + "新任务")  // 部分硬编码
<Button>{t.action?.update} 一下</Button>

// ❌ 错误示例 3：缓存术语值
const taskText = T.task.create;  // 可能导致初始化问题
```

---

## ✅ 正确的做法

### Web 前端

```javascript
// 1. 引入术语管理器
<script src="/js/terminology.js"></script>

// 2. 等待初始化
await window.T.initialize();

// 3. 使用术语（每次使用时读取，不缓存）
document.title = T.app.name;
button.textContent = T.task.create;
alert(T.message.success.taskCreated);

// 4. 带参数的消息
const msg = T.format('message.success.taskCompleted', { points: 10 });
// 结果示例: "🦅 没鸽！你是海鸥！+10 根薯条"
```

### 移动端（Capacitor - React）

```javascript
// 使用 TerminologyContext（与 Web 端完全相同）
import { useTerminology } from '../contexts/TerminologyContext';

function MyComponent() {
  const { t } = useTerminology();
  
  return (
    <div>
      <Typography>{t.task?.create}</Typography>
      <Button>{t.navigation?.dashboard}</Button>
      <span>{t.points?.name}</span>
    </div>
  );
}
```

---

## 📁 配置文件位置

### 主配置文件（单一数据源）

```
项目根目录/terminology.json
```

### 各端同步副本

```
web-frontend/public/terminology.json       ← Web 前端使用
web-frontend/dist/terminology.json         ← 构建产物
```

**同步方式**：
```bash
# 修改主配置后，手动复制到各端
cp terminology.json web-frontend/public/

# Capacitor 自动同步（npx cap sync android）
```

---

## 🔄 添加新文案的完整流程

### 步骤 1：修改主配置文件

编辑 `terminology.json`，添加新字段：

```json
{
  "terminology": {
    "task": {
      "create": "立Flag",
      "newField": "新文案"  // ← 新增字段
    },
    "message": {
      "success": {
        "taskCreated": "✅ Flag 已立，这次一定！"
      }
    }
  }
}
```

### 步骤 2：复制到前端目录

```bash
# Windows
copy /Y terminology.json web-frontend\public\terminology.json

# Linux/Mac
cp terminology.json web-frontend/public/terminology.json
```

### 步骤 3：构建并同步到移动端

```bash
cd web-frontend
npm run build
npx cap sync android
```

### 步骤 4：在代码中使用

```javascript
// Web 端
const { t } = useTerminology();
<div>{t.task.newField}</div>

// 或直接
<div>{window.T.task.newField}</div>
```

### 步骤 5：部署到服务器

如有服务器，需同步 `terminology.json`（参考项目的 SERVER_UPDATE_GUIDE.md）。

---

## 📊 配置结构示例

```json
{
  "terminology": {
    "app": {
      "name": "今天会鸽吗",
      "tagline": "做海鸥🦅，去码头搞点薯条🍟"
    },
    "navigation": {
      "dashboard": "今天会鸽吗",
      "tasks": "我的Flag",
      "friends": "我的小伙伴"
    },
    "task": {
      "create": "立Flag",
      "complete": "没鸽",
      "share": "给小伙伴看"
    },
    "message": {
      "success": {
        "taskCreated": "✅ Flag 已立，这次一定！",
        "taskCompleted": "🦅 没鸽！你是海鸥！+{points} 根薯条"
      },
      "error": {
        "taskNotFound": "🤔 这个 Flag 找不到了（鸽了？）"
      },
      "empty": {
        "tasks": "🦅 还没立 Flag？海鸥需要目标！"
      }
    }
  }
}
```

---

## 🎨 文案风格指南（示例：游戏化应用）

如果项目有统一的文案风格，应在配置旁边配置文档中描述。

### 核心主题示例

**"海鸥搞薯条梗 + 鸽子"** 的游戏化风格：

- 🦅 **海鸥** = 成功完成任务的人
- 🐦 **鸽子** = 放弃/失败/拖延的人
- 🍟 **薯条** = 积分/奖励
- 🚩 **Flag** = 任务/目标

### 文案特点

1. **游戏化表达**：
   - "段位""连击""海鸥榜""鸽王榜"

2. **幽默化提示**：
   - 成功: "🦅 没鸽！你是海鸥！"
   - 失败: "🐦 鸽了...又变回鸽子了"
   - 空状态: "👀 没有小伙伴，那还不得天天鸽"

3. **轻松的操作引导**：
   - "闭眼做😴" "得努力💪" "我太难了😭"

4. **鼓励性语言**：
   - "Flag 已立，这次一定！"
   - "搞到了 10 根薯条"

---

## 🔍 代码审查检查清单

在提交代码前，必须确认：

- [ ] 所有 UI 文本都从术语配置读取
- [ ] 没有硬编码的中文/英文字符串
- [ ] 新增文案已添加到 `terminology.json`
- [ ] 术语文件已同步到所有端
- [ ] 如有服务器，术语文件已更新
- [ ] 文案符合项目的风格指南

---

## ⚠️ 常见问题

### Q1：初始化时 T 还没好怎么办？

**A**：异步等待初始化：
```javascript
await window.T.initialize();
// 之后再使用 T.xxx
```

### Q2：如果用户切换语言，所有文本都要重新加载吗？

**A**：是的。重新加载 `terminology.json`（加载不同语言版本），然后重新渲染相关组件。

### Q3：如何处理需要变量替换的文本？

**A**：在配置中使用占位符：
```json
{
  "message.success.taskCompleted": "🦅 没鸽！+{points} 根薯条"
}

// 使用时
T.format('message.success.taskCompleted', { points: 10 });
```

---

## 📚 相关资源

- 项目的 `terminology.json`（数据源）
- 项目的 `TERMINOLOGY_GUIDE.md`（文案指南）
- 项目的 `.codebuddy/rules/terminology-usage-mandatory.mdc`（项目级强制规则）

---

**最后更新**：2026-03-20  
**优先级**：🟡 中高（影响可维护性和国际化）  
**适用范围**：需要国际化或多语言的项目；需要统一维护 UI 文案的项目
