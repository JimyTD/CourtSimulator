#!/bin/bash
# deploy.sh - CourtSimulator 一键部署脚本
#
# 前提：项目文件已通过 Lighthouse deploy_project_preparation 上传到服务器
# 使用方式：在服务器 /root/CourtSimulator 目录下执行

set -e

PROJECT_DIR="/root/CourtSimulator"

echo "=============================="
echo " CourtSimulator 部署脚本"
echo "=============================="

cd "$PROJECT_DIR"

# ── 1. 检查 Docker 和 Docker Compose ──────────────────
echo "[1/4] 检查 Docker 环境..."
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

# ── 2. 确认 .env 存在 ─────────────────────────────────
echo "[2/4] 检查环境变量..."
if [ ! -f "backend/.env" ]; then
    echo "警告: backend/.env 不存在，请创建并填入 API Key"
    echo "参考 backend/.env.example"
    exit 1
fi

# ── 3. 构建并启动容器 ─────────────────────────────────
echo "[3/4] 构建并启动容器..."
docker compose down --remove-orphans -v 2>/dev/null || true
docker compose build
docker compose up -d

# ── 4. 验证服务状态 ───────────────────────────────────
echo "[4/4] 等待服务启动..."
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
