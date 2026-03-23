---
description: 问题排查效率原则 - 快速定位问题，避免无效尝试
alwaysApply: true
enabled: true
---

# 问题排查效率原则

## 🎯 核心原则

**浪费用户时间是最大的问题。** 排查问题时优先使用已知方案，设定明确的尝试上限，避免在已证伪的方向继续浪费时间。

---

## 📌 第一原则：历史优先

### 遇到"之前修过的问题再次出现"时

1. **第一步**：查 MEMORY.md 和最近的 daily log
2. **第二步**：找到上次的修复方案
3. **第三步**：直接应用已知方案，**不要从头分析**
4. **禁止**：重新走一遍完整的排查流程

**原因**：项目积累了宝贵的排查经验，重复分析是最大的时间浪费。

---

## 🚨 效率红线（必须遵守）

| 排查行为 | 尝试上限 | 超限后的行动 |
|---------|---------|-----------|
| **构建命令尝试** | 2 种方式 | 立刻停下，换思路或询问用户 |
| **PowerShell 命令** | 第 1 次无输出 | 立刻换 `cmd /c` 或 node 脚本，不要换引号反复试 |
| **远程服务器命令** | 先 1 条简单命令确认路径 | 再执行实际操作，不要盲目发 5+ 条 |
| **同一排查方向** | 验证 1 次 | 无果立即放弃该方向，切换思路 |
| **execute_command 调用** | 合并多条为一条 | 不要为了 `ls` 一个目录就单独发命令 |

---

## 🔍 排查顺序（优先级从高到低）

1. **查历史记录** → 有已知方案直接用
2. **验证最可能的原因** → 不从最不可能的开始
3. **grep 本地产物** → 不去服务器读 minified 代码
4. **简单命令确认** → 确保环境没问题
5. **合并命令执行** → 减少弹窗次数

---

## 🗑️ 本项目已证伪的排查方向（不要再查）

如果遇到类似的问题，以下方向**已确认无关**，直接跳过：

- ❌ React Context Provider 嵌套顺序错误（源码层面是对的）
- ❌ Dockerfile COPY 路径问题（与运行时无关）
- ❌ 浏览器缓存旧 chunk（文件名含 hash，匹配即排除）
- ❌ 用 manualChunks 控制 chunk 归属（不能防止 chunk 内复制）
- ❌ 清理 Context 交叉 import（Rollup 仍会从不同入口复制）
- ❌ resolve.alias 修补 React 路径（不解决根本问题）
- ❌ ErrorBoundary / StrictMode / ES module 时序（无关）

**记录来源**：参考项目的 MEMORY.md 中的"已确认的无关方向清单"。

---

## 🔥 CourtSimulator 已踩过的坑（优先排查）

遇到类似问题时**优先检查这些方向**，不要从头分析：

### 坑 1：前端更新后页面仍显示旧内容
- **症状**：`docker compose build` 成功，但浏览器加载的 JS 文件名没变
- **根因**：Docker named volume `frontend-dist` 一旦创建有数据，不会随镜像重建自动覆盖
- **解法**：`docker compose down -v && docker compose up -d`（`-v` 删除旧 volume）
- **排查顺序**：先 `docker exec court-nginx ls /usr/share/nginx/html/assets/` 对比文件名

### 坑 2：前端报 `Cannot read properties of undefined`（配置文件路径）
- **症状**：`uiText.emperor` / `uiText.xxx` 为 `undefined`
- **根因**：组件用 `../../../shared/config/xxx.json` 跨出 frontend 目录，Docker 构建上下文只含 `frontend/`，路径解析失败
- **解法**：共享配置文件必须在 `frontend/src/data/` 下维护副本，import 用 `../data/xxx.json`
- **已修复的文件**：`officials.json`、`ui-text.json`

### 坑 3：上传覆盖部署后 .env 丢失
- **症状**：后端 500，LLM 调用失败
- **根因**：`deploy_project_preparation` 上传的是完整项目目录，`.env` 不在 Git 中所以不会包含
- **解法**：切换目录前 `cp /root/CourtSimulator/backend/.env /root/CourtSimulator_<新目录>/backend/.env`

---

## 📋 排查规范

### 1. 命令执行规范（Windows）

**构建命令**（第一选择）：
```bash
cd i:\path\to\project && npx --yes vite build
```

**为什么是 npx？**
- 屏蔽 Windows 上 `.cmd` 文件的 PowerShell/cmd 兼容性问题
- 不要用 `cmd /c` 包裹、不要 PowerShell 原生调用、不要反复试引号

**构建命令失败后**：
- 等 5 秒后检查 `dist/index.html` 是否存在
- 如果存在 = 构建成功（只是输出不可见）
- 如果不存在 = 构建失败，查看错误日志

### 2. 远程服务器命令规范

**第一步**：用简单命令确认路径存在
```bash
docker exec taskapp-app ls /app/
```

**第二步**：确认后再执行实际操作

**禁止**：盲目发多条命令而不确认环境

### 3. 命令合并原则

```bash
# ❌ 错误：分开执行
execute_command: npm run build
execute_command: npm run test
execute_command: npm run deploy

# ✅ 正确：合并执行
execute_command: npm run build && npm run test && npm run deploy
```

---

## ✅ 检查清单

排查问题前，必须确认：

- [ ] 查了 MEMORY.md 和 daily log 吗？有已知方案就直接用
- [ ] 这个方向是否已在"已证伪清单"中？是的话跳过
- [ ] 命令尝试是否超过 2 次？超过就停下换思路
- [ ] 是否在无关方向上浪费时间了？立刻切换

---

## 💡 示例

### ❌ 错误的排查方式
```
遇到构建错误
→ 尝试修改 vite.config.js resolve.alias
→ 尝试修改 manualChunks
→ 尝试清理 Context import
→ 尝试修改 Dockerfile
→ ...（无限尝试）
```

### ✅ 正确的排查方式
```
遇到构建错误
→ 查 MEMORY.md 看是否有类似问题
→ 有 = 直接应用已知方案
→ 没有 = 验证最可能的原因（如依赖版本）
→ 验证 1 次无果 = 停下，向用户报告问题
```

---

## 📚 相关资源

- 本项目的 MEMORY.md（长期记忆）
- daily log（`.codebuddy/memory/YYYY-MM-DD.md`）
- 项目规则文件（`.codebuddy/rules/`）

---

**最后更新**：2026-03-23  
**优先级**：🔴 最高（强制执行）  
**适用范围**：所有 AI 辅助开发项目
