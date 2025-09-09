@echo off
setlocal enabledelayedexpansion

echo 🤖 OmniCopilot Setup and Start Script
echo ======================================

REM Check if .env exists
if not exist .env (
    echo 📝 Creating .env file from .env.example...
    copy .env.example .env
    echo ⚠️  Please edit .env file with your actual credentials before continuing!
    echo    Required: GITHUB_WEBHOOK_SECRET, OPENAI_API_KEY
    echo    Optional: JIRA_*, MicrosoftApp*
    echo.
    pause
)

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running. Please start Docker first.
    pause
    exit /b 1
)

REM Install dependencies
where pnpm >nul 2>&1
if !errorlevel! == 0 (
    echo 📦 Installing dependencies with pnpm...
    pnpm install
) else (
    echo ⚠️  pnpm not found. Installing with npm instead...
    npm install
)

echo 🐳 Starting OmniCopilot with Docker Compose...
docker-compose up --build -d

echo ⏳ Waiting for services to start...
timeout /t 10 >nul

echo 🔍 Checking service health...

REM Check API
curl -s http://localhost:4000/health >nul 2>&1
if !errorlevel! == 0 (
    echo ✅ API is healthy (http://localhost:4000)
) else (
    echo ❌ API health check failed
)

REM Check Bot
curl -s http://localhost:3978/health >nul 2>&1
if !errorlevel! == 0 (
    echo ✅ Bot is healthy (http://localhost:3978)
) else (
    echo ❌ Bot health check failed
)

REM Check Web
curl -s http://localhost:3000 >nul 2>&1
if !errorlevel! == 0 (
    echo ✅ Web is healthy (http://localhost:3000)
) else (
    echo ❌ Web health check failed
)

echo.
echo 🎉 OmniCopilot is starting up!
echo.
echo 📋 Next Steps:
echo   1. Open http://localhost:3000 for the web dashboard
echo   2. Configure GitHub webhook: https://your-domain.com/webhooks/github
echo   3. Test with: curl -X POST http://localhost:4000/api/query -H "Content-Type: application/json" -d "{\"role\":\"dev\",\"question\":\"test\"}"
echo.
echo 📊 View logs: docker-compose logs -f
echo 🛑 Stop: docker-compose down

pause
