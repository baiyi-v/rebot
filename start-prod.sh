#!/bin/bash
# 生产环境启动脚本
# 使用方法：
# 1. 设置环境变量（可选，会覆盖 .env 文件）
#    export PORT=3000
#    export TOMATO_SERVER_URLS=http://127.0.0.1:18423,http://127.0.0.1:18424
#    export ADMIN_SECRET=your-secret-key
# 2. 运行脚本
#    chmod +x start-prod.sh
#    ./start-prod.sh

echo "🚀 启动番茄代理服务..."

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误：未找到 Node.js，请先安装"
    exit 1
fi

# 检查依赖是否安装
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install --production
fi

export NODE_ENV="${NODE_ENV:-production}"

# 启动服务
echo "📍 服务将运行在: http://localhost:${PORT:-3000}"
node server/index.mjs "$@"