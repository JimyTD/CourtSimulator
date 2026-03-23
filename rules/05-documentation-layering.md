---
description: 文档分层管理规则 - 临时记录与正式文档分离
alwaysApply: false
enabled: true
---

# 文档分层管理规则

## 📌 核心原则

**所有 bugfix、改善、临时记录类文档必须统一放在 `docs/bugfix-logs/` 目录下，严禁在项目根目录创建！**

---

## 🎯 适用范围

### ✅ 必须放在 `docs/bugfix-logs/` 的文档

- Bug 修复记录（如 `DIALOG_IMPROVEMENTS.md`）
- 功能改善记录（如 `ANDROID_TASK_FORM_UPDATE.md`）
- 构建日志（如 `build-log.txt`）
- 问题排查记录
- 临时开发笔记
- 代码重构记录
- UI/UX 调整记录
- 性能优化记录
- 技术实验笔记

### ❌ 不应放在此目录的文档

- 正式的项目文档（保持在 `docs/` 根目录）
- README 文件
- API 文档
- 用户手册
- 部署指南
- 架构设计文档

---

## 📝 命名规范

### 推荐格式 1：日期 + 简短描述

```
YYYY-MM-DD-简短描述.md

示例：
- 2026-02-25-dialog-text-color-fix.md
- 2026-02-25-task-form-improvements.md
- 2026-02-25-android-build-errors.md
```

### 推荐格式 2：描述性命名

```
大写字母_下划线_英文.md

示例：
- DIALOG_IMPROVEMENTS.md
- ANDROID_TASK_FORM_UPDATE.md
- TEXT_COLOR_FIXES.md
- BUILD_LOG.txt
```

### 选择建议

- **频繁修改的临时记录** → 用日期格式（便于按时间排序）
- **相对稳定的改善记录** → 用描述性名称（便于查找）

---

## 🚫 禁止的做法

### ❌ 在项目根目录创建临时文档

```
❌ /DIALOG_IMPROVEMENTS.md
❌ /BUGFIX_NOTES.md
❌ /TODO.md
❌ /build-log.txt
```

### ❌ 散落在各个子目录

```
❌ /android-client/FIXES.md
❌ /public/CHANGES.md
❌ /routes/UPDATES.md
❌ /web-frontend/IMPROVEMENTS.md
```

### ❌ 混入正式项目文档

```
❌ /docs/TEMPORARY_BUGFIX.md       # 临时文档不应在 docs 根目录
❌ /docs/DEPLOYMENT.md 中写临时修复  # 应分离到 bugfix-logs
```

---

## ✅ 正确的做法

### 创建新文档时

```bash
# 正确：直接在目标目录创建
docs/bugfix-logs/2026-02-25-feature-fix.md
docs/bugfix-logs/DIALOG_IMPROVEMENTS.md

# 错误
DIALOG_IMPROVEMENTS.md                    # ❌ 根目录
docs/DIALOG_IMPROVEMENTS.md               # ❌ docs 根目录
```

### AI 助手的行为规范

1. **自动放置到正确位置**
   ```javascript
   // 错误
   write_to_file("i:/project/BUGFIX.md", content)
   
   // 正确
   write_to_file("i:/project/docs/bugfix-logs/BUGFIX.md", content)
   ```

2. **发现根目录临时文件时自动整理**
   ```bash
   # 检测到根目录有临时文档
   DIALOG_IMPROVEMENTS.md (项目根目录)
   
   # 应自动移动或提示用户
   move DIALOG_IMPROVEMENTS.md docs\bugfix-logs\
   ```

3. **提醒用户定期清理**
   ```
   ✅ 文档已创建在 docs/bugfix-logs/xxx.md
   💡 提示：这些是临时文档，建议定期清理（每周/每月）
   ```

---

## 📂 目录结构示例

```
i:/project/
├── docs/
│   ├── bugfix-logs/                       ← 临时记录（可定期清理）
│   │   ├── 2026-02-25-dialog-fixes.md
│   │   ├── ANDROID_TASK_FORM_UPDATE.md
│   │   ├── build-log.txt
│   │   └── DIALOG_IMPROVEMENTS.md
│   │
│   ├── API.md                             ← 正式文档（长期保留）
│   ├── DEPLOYMENT.md
│   ├── ARCHITECTURE.md
│   └── README.md
│
├── README.md                               ← 项目主文档
├── CHANGELOG.md                            ← 变更日志（项目根目录可以）
└── PROJECT_STATUS.md                       ← 项目状态（项目根目录可以）
```

---

## 🔄 迁移现有文档

如果项目中发现临时文档散落在各处，应进行整理：

```bash
# Windows
move ANDROID_TASK_FORM_UPDATE.md docs\bugfix-logs\
move DIALOG_IMPROVEMENTS.md docs\bugfix-logs\
move build-log.txt docs\bugfix-logs\

# Linux/Mac
mv ANDROID_TASK_FORM_UPDATE.md docs/bugfix-logs/
mv DIALOG_IMPROVEMENTS.md docs/bugfix-logs/
mv build-log.txt docs/bugfix-logs/
```

---

## 💡 使用场景

### 场景 1：修复 UI 问题后

```markdown
AI 完成修复
↓
创建文档记录细节（哪个组件、如何修复、为什么这样修）
↓
保存到 docs/bugfix-logs/YYYY-MM-DD-ui-fix.md
↓
用户定期审查 → 提取有价值信息 → 删除临时记录
```

### 场景 2：构建错误排查

```markdown
遇到构建错误
↓
记录排查过程（尝试了什么、错误信息、最终解决方案）
↓
保存到 docs/bugfix-logs/build-log.txt
↓
问题解决后 → 文档作为临时参考 → 可在下次清理时删除
```

### 场景 3：功能改进

```markdown
实现功能改进
↓
记录改进细节（改动范围、测试结果、为什么这样改）
↓
保存到 docs/bugfix-logs/FEATURE_IMPROVEMENTS.md
↓
改进稳定运行 → 更新正式文档（如 ARCHITECTURE.md） → 删除临时记录
```

---

## 📊 文档生命周期

```
创建 → 使用 → 审查 → 归档/删除
 ↓       ↓       ↓        ↓
临时   参考   提取价值  清理磁盘
记录   数据   信息
```

### 建议清理周期

- **每周**：清理已解决的 bugfix 记录
- **每月**：整理并归档重要记录
- **每季度**：全面清理过期临时文档

---

## ✅ 检查清单

项目应定期检查：

- [ ] 是否有临时文档在项目根目录？
- [ ] 是否有临时文档散落在 src/、routes/ 等子目录？
- [ ] `docs/bugfix-logs/` 目录是否存在并有合理的整理？
- [ ] 是否有超过 3 个月未更新的临时文档应该清理？
- [ ] 临时文档的命名是否遵循规范？

---

## ⚠️ 例外情况

以下文档**可以保留在项目根目录**：

- `README.md` — 项目说明
- `PROJECT_STATUS.md` — 项目状态
- `CHANGELOG.md` — 变更日志（如果维护）
- `.gitignore`、`package.json` 等配置文件
- `LICENSE` — 开源许可证

---

## 🔍 快速参考

### 创建新 bugfix 文档

```bash
# 推荐路径
docs/bugfix-logs/描述性名称.md
docs/bugfix-logs/YYYY-MM-DD-简短描述.md
```

### 检查是否有遗漏的临时文档

```bash
# 项目根目录应该很干净
ls *.md | grep -v "README\|PROJECT_STATUS\|CHANGELOG"
```

### 批量移动临时文档

```bash
# 一次性整理所有临时文档
move *_IMPROVEMENTS.md docs\bugfix-logs\
move *_UPDATE.md docs\bugfix-logs\
move *-log.txt docs\bugfix-logs\
```

---

**最后更新**：2026-03-20  
**优先级**：🟡 中等（保持项目整洁）  
**适用范围**：需要长期维护的项目；有频繁 bugfix 的项目
