# Lighthouse 部署指南

本指南描述如何使用 Tencent Lighthouse 接口部署 CourtSimulator 到腾讯云服务器。

> **核心原则：Git 与服务器更新无关。** 服务器上不使用 git，代码通过 Lighthouse `deploy_project_preparation` 接口从本地上传。

## 前置条件

1. **Tencent Lighthouse 实例已创建**
   - 实例 ID：`lhins-5xyrg0ei`
   - 地域：`ap-beijing`
   - 公网 IP：`62.234.18.113`
   - 系统：OpenCloudOS (Linux)
   - 已安装 Docker 和 Docker Compose

2. **CodeBuddy Lighthouse 集成已连接**

3. **服务器上已有 `backend/.env`（首次部署时手动创建，后续不需要重复）**

## 更新部署流程（3 步）

### 第 1 步：上传项目文件

通过 Lighthouse `deploy_project_preparation` 接口将本地项目目录上传到服务器：

- **本地路径**：`i:\AIGameTest\CourtSimulator`
- **服务器目标**：`/root/CourtSimulator`
- **项目名称**：`CourtSimulator`

### 第 2 步：执行部署脚本

通过 Lighthouse `execute_command` 接口在服务器上执行：

```bash
cd /root/CourtSimulator && bash deploy.sh
```

`deploy.sh` 会自动：
- 检查 Docker 环境（不存在则安装）
- 验证 `backend/.env` 配置
- 停止旧容器 → 重新构建镜像 → 启动新容器
- 验证服务健康状态

### 第 3 步：验证部署

部署完成后，访问：

```
http://62.234.18.113:9000
```

或通过 Lighthouse 接口查询服务状态：

```bash
curl -f http://localhost:9000/health
```

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

## 已知问题与经验

### 1. Windows CRLF 导致脚本执行失败

**症状**：服务器上执行 `bash deploy.sh` 报错 `\r: command not found` 或 `syntax error`。

**原因**：在 Windows 上编辑的 `.sh` 文件使用 `\r\n`（CRLF）换行符，Linux 无法识别 `\r`。

**解决**：在服务器上执行部署脚本前，先转换换行符：

```bash
dos2unix /root/CourtSimulator/deploy.sh
```

如果 `dos2unix` 不存在，用 `sed` 替代：

```bash
sed -i 's/\r$//' /root/CourtSimulator/deploy.sh
```

> **预防**：`deploy_project_preparation` 上传文件后，养成先执行 `dos2unix` 的习惯。

### 2. `--no-cache` 构建超时（低配服务器）

**症状**：`execute_command` 调用 `bash deploy.sh` 超时无返回，但服务器上构建仍在进行。

**原因**：`deploy.sh` 中 `docker compose build --no-cache` 在低配服务器（如 2G 内存）上耗时较长（5-10 分钟），超过了 Lighthouse `execute_command` 的超时限制。

**解决**：使用 `nohup` 后台执行，配合日志轮询检查进度：

```bash
# 后台执行部署脚本，输出重定向到日志文件
nohup bash /root/CourtSimulator/deploy.sh > /tmp/court-deploy.log 2>&1 &
```

然后定期查看日志确认进度：

```bash
tail -50 /tmp/court-deploy.log
```

看到 `✅ 部署成功！` 或 `docker compose up -d` 完成即表示部署结束。

> **提示**：如果不是首次部署且改动较小，可以去掉 `--no-cache` 参数利用 Docker 缓存加速构建。将 `deploy.sh` 中的 `docker compose build --no-cache` 改为 `docker compose build` 即可。

### 3. Docker Named Volume 导致前端产物未更新

**症状**：部署完成、容器正常运行，但浏览器访问看到的仍是旧版前端（清缓存也无效）。

**原因**：`docker-compose.yml` 中 `frontend-dist` 是 Docker named volume。`docker compose down` **不会删除 named volume**，导致旧的前端构建产物一直保留在卷中。即使 `frontend-builder` 重新构建，如果 Vite 生成了不同 hash 的文件名，Nginx 仍可能读到旧的 `index.html` 指向旧文件。

**解决**：停止容器时加 `-v` 参数删除卷：

```bash
docker compose down --remove-orphans -v
```

> `deploy.sh` 已包含此参数，正常使用部署脚本即可。

### 4. 完整的部署命令序列（推荐）

综合以上经验，通过 Lighthouse 接口执行的完整命令序列为：

```bash
# 1. 修复 CRLF
dos2unix /root/CourtSimulator/deploy.sh

# 2. 后台执行（避免超时）
nohup bash /root/CourtSimulator/deploy.sh > /tmp/court-deploy.log 2>&1 &

# 3. 等待后查看日志
sleep 5 && tail -50 /tmp/court-deploy.log
```

---

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

按照上面的 **更新部署流程（3 步）** 操作即可：
1. `deploy_project_preparation` 上传最新代码
2. `execute_command` 执行 `bash deploy.sh`
3. 验证服务

**禁止在服务器上使用 git clone / git pull，代码只通过 Lighthouse 接口上传。**

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
