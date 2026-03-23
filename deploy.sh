#!/bin/bash
# deploy.sh - CourtSimulator 一键部署脚本
# 使用方式：在服务器上执行，需要项目代码已在 /root/CourtSimulator
# 或通过 Lighthouse RunCommand 接口调用

set -e

PROJECT_DIR="/root/CourtSimulator"
REPO_URL="https://github.com/JimyTD/CourtSimulator.git"

echo "=============================="
echo " CourtSimulator 部署脚本"
echo "=============================="

# ── 1. 检查 Docker 和 Docker Compose ──────────────────
echo "[1/5] 检查 Docker 环境..."
if ! command -v docker &> /dev/null; then
    echo "安装 Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

if ! docker compose version &> /dev/null; then
    echo "安装 Docker Compose Plugin..."
    apt-get update && apt-get install -y docker-compose-plugin
fi

echo "Docker: $(docker --version)"
echo "Docker Compose: $(docker compose version)"

# ── 2. 拉取/更新代码 ──────────────────────────────────
echo "[2/5] 更新代码..."
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR"
    git pull origin main
else
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi

# ── 3. 确认 .env 存在 ─────────────────────────────────
echo "[3/5] 检查环境变量..."
if [ ! -f "backend/.env" ]; then
    echo "警告: backend/.env 不存在，请创建并填入 API Key"
    echo "参考 backend/.env.example"
    exit 1
fi

# ── 4. 构建并启动容器 ─────────────────────────────────
echo "[4/5] 构建并启动容器..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose build --no-cache
docker compose up -d

# ── 5. 验证服务状态 ───────────────────────────────────
echo "[5/5] 等待服务启动..."
sleep 5

if curl -sf http://localhost:9000/health > /dev/null; then
    echo ""
    echo "✅ 部署成功！"
    echo "访问地址: http://62.234.18.113:9000"
else
    echo ""
    echo "⚠️  服务可能未完全启动，查看日志："
    docker compose logs --tail=30
fi

echo ""
echo "查看实时日志: docker compose logs -f"
echo "停止服务:     docker compose down"
