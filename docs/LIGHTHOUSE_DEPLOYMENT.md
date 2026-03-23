# Lighthouse 部署指南

本指南描述如何使用 Tencent Lighthouse 接口部署 CourtSimulator 到腾讯云服务器。

## 前置条件

1. **Tencent Lighthouse 实例已创建**
   - 实例 ID：需从 Lighthouse 控制台获取
   - 系统：Ubuntu 20.04 LTS 或更高版本
   - 已安装 Docker 和 Docker Compose

2. **Lighthouse 接口配置**
   - 确保 CodeBuddy 中已连接 Lighthouse 集成
   - 获取 API Token 和实例信息

## 部署流程

### 方式一：使用 Lighthouse RunCommand 接口（推荐）

#### 1. 准备部署环境

首先确保后端的 `.env` 文件已准备好。参考 `backend/.env.example`：

```bash
# backend/.env 示例
OPENAI_API_KEY=sk-xxxxxxxxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
```

#### 2. 通过 CodeBuddy Lighthouse 集成部署

在 CodeBuddy IDE 中：

1. 点击右上角菜单 → **集成** → **Lighthouse**
2. 选择目标实例（或输入实例 ID）
3. 执行部署命令：

```bash
bash /root/CourtSimulator/deploy.sh
```

或者分步骤手动部署：

```bash
# 拉取代码
cd /root && git clone https://github.com/JimyTD/CourtSimulator.git

# 或更新已有代码
cd /root/CourtSimulator && git pull origin main

# 构建并启动
docker compose -f docker-compose.yml up -d --build
```

#### 3. 验证部署

部署完成后，访问：

```
http://62.234.18.113:9000
```

或通过 Lighthouse 接口查询服务状态：

```bash
curl -f http://localhost:9000/health
```

### 方式二：使用部署脚本（自动化）

服务器上执行一键部署脚本：

```bash
bash /root/CourtSimulator/deploy.sh
```

该脚本会自动：
- 检查 Docker 环境（不存在则安装）
- 拉取/更新代码
- 验证 `.env` 配置
- 构建并启动所有容器
- 验证服务健康状态

## 服务架构

```
Lighthouse 实例
├── Docker
│   ├── Backend (FastAPI + uvicorn)
│   │   └── Port 8000 (内部)
│   ├── Frontend Builder (Vite)
│   │   └── 生成 dist 产物
│   └── Nginx (反向代理)
│       └── Port 9000 (外部访问)
└── 共享卷：frontend-dist (前端产物)
```

## 容器服务详情

### Backend 容器

- **镜像**：基于 `backend/Dockerfile`
- **端口**：8000（仅内部通信）
- **依赖环境变量**：`backend/.env`
- **健康检查**：`GET /health` 每 30s 一次

### Frontend Builder 容器

- **镜像**：基于 `frontend/Dockerfile.build`
- **任务**：执行 `npm run build` 生成前端产物
- **产物位置**：`/app/frontend/dist`
- **完成后自动退出**

### Nginx 容器

- **镜像**：`nginx:1.25-alpine`
- **端口**：9000（对外服务）
- **配置文件**：`nginx/court.conf`
- **功能**：
  - 反向代理 API 请求到 Backend
  - 提供静态前端文件
  - 支持 WebSocket 连接

## 常见操作

### 查看服务日志

```bash
# 查看全部容器日志
docker compose logs -f

# 查看特定容器日志（如后端）
docker compose logs -f backend

# 查看最后 30 行日志
docker compose logs --tail=30
```

### 停止服务

```bash
docker compose down
```

### 重启服务

```bash
docker compose down && docker compose up -d
```

### 重新构建并部署

```bash
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d
```

### 进入容器执行命令

```bash
# 进入后端容器
docker compose exec backend bash

# 进入前端容器（已退出，可用 docker exec）
docker exec -it court-frontend-builder sh

# 查看 nginx 配置
docker compose exec nginx cat /etc/nginx/conf.d/default.conf
```

## 环境变量配置

### Backend 环境变量

编辑 `backend/.env`（服务器上），支持以下变量：

```env
# LLM 配置（必需）
OPENAI_API_KEY=sk-xxxxxxxxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1

# 可选：代理设置
HTTP_PROXY=http://proxy.example.com:8080
HTTPS_PROXY=https://proxy.example.com:8443

# 可选：日志级别
LOG_LEVEL=INFO
```

修改后需重启容器：

```bash
docker compose restart backend
```

## 故障排查

### 服务无法访问（http://62.234.18.113:9000）

1. **检查容器是否运行**：
   ```bash
   docker compose ps
   ```
   所有容器应显示 `Up` 状态

2. **检查网络连接**：
   ```bash
   docker compose logs nginx
   ```
   查看 nginx 是否有错误日志

3. **检查防火墙**：
   ```bash
   sudo ufw allow 9000
   ```

### Backend 容器崩溃

1. **查看错误日志**：
   ```bash
   docker compose logs backend
   ```

2. **检查 .env 配置**：
   - 确保 `backend/.env` 存在且包含有效的 API Key
   - 检查 API 端点是否可访问

3. **重新构建**：
   ```bash
   docker compose build --no-cache backend
   docker compose up -d backend
   ```

### 前端无法加载

1. **检查 Builder 构建结果**：
   ```bash
   docker volume inspect court_frontend-dist
   ```

2. **手动构建前端**：
   ```bash
   docker compose build --no-cache frontend-builder
   docker compose up frontend-builder
   docker compose restart nginx
   ```

3. **查看 Nginx 日志**：
   ```bash
   docker compose logs nginx
   ```

## 后续维护

### 更新代码

在服务器上执行：

```bash
cd /root/CourtSimulator
git pull origin main
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d
```

### 备份数据

如果有持久化数据，定期备份相关卷和配置：

```bash
# 备份 .env 文件
cp backend/.env /backup/backend.env.backup
```

### 监控服务

定期检查服务状态：

```bash
# 定时任务示例（crontab -e）
*/5 * * * * curl -sf http://localhost:9000/health > /dev/null || (docker compose restart && echo "Service restarted at $(date)" >> /var/log/court-restart.log)
```

## 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 系统架构设计
- [API.md](./API.md) - API 接口规范
- [DESIGN.md](./DESIGN.md) - 产品设计文档
- [deploy.sh](../deploy.sh) - 自动化部署脚本
