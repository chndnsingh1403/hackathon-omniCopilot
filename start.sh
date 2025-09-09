#!/bin/bash

# OmniCopilot Setup Script

set -e

echo "🤖 OmniCopilot Setup and Start Script"
echo "======================================"

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your actual credentials before continuing!"
    echo "   Required: GITHUB_WEBHOOK_SECRET, OPENAI_API_KEY"
    echo "   Optional: JIRA_*, MicrosoftApp*"
    echo ""
    read -p "Press Enter after editing .env file to continue..."
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if pnpm is installed (for local development)
if command -v pnpm &> /dev/null; then
    echo "📦 Installing dependencies with pnpm..."
    pnpm install
else
    echo "⚠️  pnpm not found. Installing with npm instead..."
    npm install
fi

echo "🐳 Starting OmniCopilot with Docker Compose..."
docker-compose up --build -d

echo "⏳ Waiting for services to start..."
sleep 10

# Health checks
echo "🔍 Checking service health..."

# Check API
if curl -s http://localhost:4000/health > /dev/null; then
    echo "✅ API is healthy (http://localhost:4000)"
else
    echo "❌ API health check failed"
fi

# Check Bot
if curl -s http://localhost:3978/health > /dev/null; then
    echo "✅ Bot is healthy (http://localhost:3978)"
else
    echo "❌ Bot health check failed"
fi

# Check Web
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ Web is healthy (http://localhost:3000)"
else
    echo "❌ Web health check failed"
fi

echo ""
echo "🎉 OmniCopilot is starting up!"
echo ""
echo "📋 Next Steps:"
echo "  1. Open http://localhost:3000 for the web dashboard"
echo "  2. Configure GitHub webhook: https://your-domain.com/webhooks/github"
echo "  3. Test with: curl -X POST http://localhost:4000/api/query -H \"Content-Type: application/json\" -d '{\"role\":\"dev\",\"question\":\"test\"}'"
echo ""
echo "📊 View logs: docker-compose logs -f"
echo "🛑 Stop: docker-compose down"
