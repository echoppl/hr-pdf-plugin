#!/usr/bin/env bash
set -e

# ============================================
# PDF Upload Service - 一键部署脚本
# 在腾讯云服务器上执行: bash deploy.sh
# ============================================

echo "=========================================="
echo "  PDF Upload Service 部署脚本"
echo "=========================================="
echo ""

PROJECT_DIR="/opt/pdf-upload-service"

# ---- 1. 检查 Docker ----
if ! command -v docker &>/dev/null; then
  echo "[1/5] 正在安装 Docker..."
  curl -fsSL https://get.docker.com | bash
  systemctl enable docker && systemctl start docker
else
  echo "[1/5] Docker 已安装 ✓"
fi

# ---- 2. 检查 Docker Compose ----
if ! docker compose version &>/dev/null; then
  echo "[2/5] 正在安装 Docker Compose..."
  apt-get update && apt-get install -y docker-compose-plugin
else
  echo "[2/5] Docker Compose 已安装 ✓"
fi

# ---- 3. 拉取代码 ----
if [ -d "$PROJECT_DIR" ]; then
  echo "[3/5] 项目目录已存在，拉取最新代码..."
  cd "$PROJECT_DIR"
  git pull
else
  echo "[3/5] 克隆项目..."
  git clone https://github.com/echoppl/hr-pdf-plugin.git "$PROJECT_DIR"
  cd "$PROJECT_DIR/pdf-upload-service" 2>/dev/null || cd "$PROJECT_DIR"
fi

# ---- 4. 创建 .env.production ----
echo "[4/5] 配置环境变量..."
cd "$PROJECT_DIR"

# Find the pdf-upload-service directory (handle both repo root and subdir)
if [ -f "pdf-upload-service/.env.production" ]; then
  cd pdf-upload-service
fi

if [ ! -f ".env.production" ]; then
  echo "❌ 未找到 .env.production 模板文件！"
  echo "   请先编辑 .env.production 填入你的配置，然后重新运行此脚本。"
  exit 1
fi

# 检查是否还是占位符
if grep -q "请替换" .env.production 2>/dev/null; then
  echo ""
  echo "⚠️  检测到 .env.production 中仍有占位符，请先编辑填入真实配置："
  echo "   vim .env.production"
  echo ""
  echo "   需要修改的项："
  echo "   - JWT_SECRET        随机字符串（至少32位）"
  echo "   - COS_SECRET_ID     腾讯云 SecretId"
  echo "   - COS_SECRET_KEY    腾讯云 SecretKey"
  echo "   - COS_BUCKET        腾讯云 COS 存储桶名称"
  echo "   - LLM_API_KEY       智谱AI API Key"
  echo ""
  exit 1
fi

echo "   .env.production 配置就绪 ✓"

# ---- 5. 启动服务 ----
echo "[5/5] 构建并启动服务..."
docker compose up -d --build

sleep 3

# 验证
if curl -s http://localhost:3000/api/health | grep -q ok; then
  echo ""
  echo "=========================================="
  echo "  ✅ 部署成功！"
  echo "=========================================="
  echo ""
  SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "你的服务器IP")
  echo "  管理后台:  http://${SERVER_IP}:3000/admin"
  echo "  健康检查:  http://${SERVER_IP}:3000/api/health"
  echo "  数据目录:  ${PROJECT_DIR}/data/"
  echo ""
  echo "  常用命令："
  echo "    查看日志:  docker compose logs -f"
  echo "    重启服务:  docker compose restart"
  echo "    停止服务:  docker compose down"
  echo "    更新代码:  git pull && docker compose up -d --build"
  echo ""
else
  echo ""
  echo "❌ 服务启动失败，请查看日志："
  echo "   docker compose logs"
fi
