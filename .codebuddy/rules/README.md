# CourtSimulator Rules（上朝模拟器规则库）

> 从其他项目实战中提炼的通用规则，已针对上朝模拟器项目特性做了调整。

## 📑 规则索引

| # | 规则文件 | 描述 | 优先级 |
|---|---------|------|--------|
| 1 | `01-troubleshooting-efficiency.mdc` | 问题排查效率原则 | 🔴 最高 |
| 2 | `02-tech-selection-early-warning.mdc` | 技术选型预警规则 | 🔴 最高 |
| 3 | `03-git-commit-authorization.mdc` | Git 提交授权机制（含提交规范） | 🔴 高 |
| 4 | `04-ui-text-config-driven.mdc` | 文案配置驱动（官员角色配置化） | 🟡 中高 |
| 5 | `05-documentation-layering.mdc` | 文档分层管理 | 🟡 中 |
| 6 | `06-user-facing-changelog.mdc` | 面向玩家的 Changelog（古风调性） | 🟡 中 |
| 7 | `07-windows-dev-efficiency.mdc` | Windows 开发效率优化 | 🟡 中 |

## 🔧 使用方式

CodeBuddy 会自动读取 `.codebuddy/rules/` 下的 `.mdc` 文件。
`alwaysApply: true` 的规则始终生效，其余规则按场景匹配激活。

---

**最后更新**：2026-03-23
