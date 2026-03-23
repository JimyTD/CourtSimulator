---
description: Windows 开发效率优化规则 - 减少弹窗打断，优化命令执行
alwaysApply: false
enabled: true
---

# Windows 开发效率优化规则

## 🎯 核心问题

在 Windows 上使用 `execute_command` 工具时，**每次都会弹出 CMD/PowerShell 窗口打断用户工作**。因此必须优化策略，最小化命令行调用次数和重复尝试。

---

## 📌 核心原则

1. **减少弹窗** — 能不调用命令行就不调用
2. **合并命令** — 多条命令合并为一条
3. **避免重试** — 不要反复尝试同一命令的不同形式
4. **优先本地工具** — 用 `read_lints` 代替 `npx tsc --noEmit`

---

## 🔨 前端构建命令（Windows）

### ✅ 正确方式（优先使用）

```bash
cd i:\AIGameTest\AndroidTaskApp\web-frontend && npx --yes vite build
```

**为什么是 npx？**
- 屏蔽 Windows 上 `.cmd` 文件在 PowerShell 和 cmd 之间的兼容性问题
- 直接调用 Node.js，不依赖 shell 环境
- 输出更稳定可靠

### ❌ 错误方式（不要使用）

```bash
# 错误 1：cmd /c 内用 && 连接 — 经常无输出或卡住
cmd /c "cd /d xxx && node_modules\.bin\vite.cmd build"

# 错误 2：PowerShell 原生调用 .cmd 文件 — 可能无输出
Set-Location xxx; node_modules\.bin\vite.cmd build

# 错误 3：绝对路径直接调用 .cmd — 工作目录不对
i:\...\vite.cmd build --outDir xxx

# 错误 4：& cmd /c 'xxx' — PowerShell 单引号内 cmd 语法冲突
& cmd /c 'cd /d xxx && vite.cmd build'
```

### 关键原则

- **第一次就用 `npx --yes vite build`**，不要反复试
- 如输出为空，**等 5 秒后检查 `dist/index.html` 是否存在**
- 最多尝试 2 次，无果立刻换思路（参考"排查效率原则"）

---

## 💻 命令执行效率优化

### 1. 合并多条命令

**❌ 错误：分开执行**
```
execute_command: npm install
execute_command: npm run build
execute_command: npm run test
```
→ 每条都弹窗，用户被打断 3 次

**✅ 正确：合并执行**
```
execute_command: npm install && npm run build && npm run test
```
→ 仅弹窗 1 次，用户只被打断一次

### 2. 类型检查（优先用 read_lints）

**❌ 错误：用命令行**
```
execute_command: npx tsc --noEmit
```
→ 弹窗运行 TypeScript，等待完成

**✅ 正确：用 read_lints 工具**
```
read_lints("./src")
```
→ 无弹窗，IDE 内置工具，更快

### 3. 远程服务器命令优化

**❌ 错误：逐个命令**
```
execute_command: docker exec app ls /app/
execute_command: docker exec app cat /app/config.js
execute_command: docker exec app npm version
```
→ 3 条分开执行，用户被打断多次

**✅ 正确：合并为一条**
```
execute_command: docker exec app sh -c 'ls /app && npm version'
```
→ 一条命令搞定

### 4. 不要为了单个查询就发命令

**❌ 错误**
```
execute_command: docker exec app ls /app/dist/
```
（仅为了确认 dist 目录存在）

**✅ 正确**
```
# 把路径确认合并到实际操作中
execute_command: docker exec app sh -c 'test -d /app/dist && npm run build'
```

---

## 🔍 Windows 特定问题

### PowerShell 命令无输出

**症状**：执行命令后无任何输出，但过一会儿任务完成了

**原因**：PowerShell 和 cmd 对 `.cmd` 文件的处理不同

**解决**：
1. 第一次尝试用 `npx` 代替 `.cmd`
2. 如必须用 `.cmd`，用 `cmd /c` 包裹
3. 如果 `cmd /c` 仍无输出，等待并检查产物

### 不要反复换引号

**❌ 错误尝试**
```
cmd /c "cd /d xxx && vite.cmd build"    # 试试
cmd /c 'cd /d xxx && vite.cmd build'    # 不行，试试这个
cmd /c cd /d xxx && vite.cmd build      # 还是不行，试试这个
& cmd /c "..."                          # 再试试
```

**✅ 正确做法**
```
# 只试一次 npx
npx --yes vite build

# 如必须试 cmd /c，只试一种引号方式
cmd /c "cd /d path && vite.cmd build"

# 无果立刻放弃，换思路
```

---

## 📊 命令尝试上限

| 行为 | 上限 | 超限后 |
|------|------|--------|
| npx 构建命令 | 1 次 | 不用，查看报错后换思路 |
| cmd /c 命令 | 1 种引号方式 | 不行就换 npx 或 node 脚本 |
| PowerShell 原生命令 | 无输出即放弃 | 立刻换 cmd /c 或 npx |
| 远程服务器命令 | 先 1 条简单的确认 | 再执行实际操作 |

---

## 🛠️ 推荐工具组合（Windows）

### 替代 PowerShell 的方案

| 任务 | 推荐方案 | 说明 |
|------|---------|------|
| 运行 npm 脚本 | `npx --yes xxx` | 最稳定 |
| 运行 .cmd 文件 | `cmd /c "xxx"` | 兼容性好 |
| Node.js 脚本 | `node script.js` | 高效可靠 |
| 检查类型错误 | `read_lints()` | 无弹窗 |
| 查看文件 | `read_file()` | 无弹窗 |
| 搜索代码 | `search_content()` | 无弹窗 |

---

## ✅ 检查清单

在执行 Windows 命令前，确认：

- [ ] 这个命令能合并到其他命令吗？
- [ ] 能用本地工具（read_lints、search_content）代替吗？
- [ ] 是否会弹窗？能减少弹窗次数吗？
- [ ] 是否是为了单个查询发命令？能避免吗？
- [ ] 是否反复尝试同一命令？应该第一次就用正确方式

---

## 💡 示例对比

### ❌ 低效的操作

```javascript
// 问题：每次都弹窗，重复尝试
execute_command: "npm run build"    // 窗口 1
execute_command: "npm run build"    // 窗口 2（重试）
read_file("dist/index.html")        // 查看是否生成
execute_command: "npm run test"     // 窗口 3
read_file(".env")                   // 查看配置
```

> 用户被弹窗打断 3 次

### ✅ 高效的操作

```javascript
// 优化后
execute_command: "npm run build && npm run test"  // 仅 1 个窗口
read_file("dist/index.html")                      // 确认构建产物
read_file(".env")                                 // 查看配置
```

> 用户仅被弹窗打断 1 次

---

## 🎯 对不同任务的建议

### 前端构建 & 测试
```bash
# ✅ 正确
npx --yes vite build && npm run test

# ❌ 避免
npm run build && npm run test
npm run build
npm run test
```

### 类型检查
```bash
# ✅ 正确
read_lints("./src")

# ❌ 避免
npx tsc --noEmit
```

### 远程操作
```bash
# ✅ 正确（先确认路径）
docker exec app sh -c 'test -d /app && npm version'

# ❌ 避免
docker exec app ls /app/
docker exec app npm version
```

---

## 📚 相关规则

- **排查效率原则**：不要反复尝试同一个命令
- **Windows 开发环境检查清单**：每次发命令都问自己能否优化

---

**最后更新**：2026-03-20  
**优先级**：🟡 中（提升开发体验）  
**适用范围**：Windows 开发环境
