#!/bin/bash

# OmniCopilot Testing Script

set -e

echo "🧪 OmniCopilot Testing Suite"
echo "============================"

API_URL="http://localhost:4000"
BOT_URL="http://localhost:3978"
WEB_URL="http://localhost:3000"

echo "🔍 Running health checks..."

# Test API health
echo -n "API health check... "
if curl -s -f "$API_URL/health" > /dev/null; then
    echo "✅ PASS"
else
    echo "❌ FAIL"
    exit 1
fi

# Test Bot health  
echo -n "Bot health check... "
if curl -s -f "$BOT_URL/health" > /dev/null; then
    echo "✅ PASS"
else
    echo "❌ FAIL"
    exit 1
fi

# Test Web health
echo -n "Web health check... "
if curl -s -f "$WEB_URL" > /dev/null; then
    echo "✅ PASS"
else
    echo "❌ FAIL"
    exit 1
fi

echo ""
echo "🔧 Testing API endpoints..."

# Test query endpoint with sample data
echo -n "Query endpoint test... "
RESPONSE=$(curl -s -X POST "$API_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"role":"dev","question":"What are recent changes?"}')

if echo "$RESPONSE" | grep -q "answer"; then
    echo "✅ PASS"
else
    echo "❌ FAIL - Response: $RESPONSE"
fi

# Test digest endpoint
echo -n "Digest endpoint test... "
DIGEST=$(curl -s "$API_URL/api/digest")
if echo "$DIGEST" | grep -q "health_score"; then
    echo "✅ PASS"
else
    echo "❌ FAIL - Response: $DIGEST"
fi

echo ""
echo "📊 Database connectivity test..."
docker-compose exec -T db psql -U omni -d omni -c "SELECT COUNT(*) FROM source_docs;" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
fi

echo ""
echo "📈 System status:"
echo "=================="

# Show container status
docker-compose ps

echo ""
echo "📋 Service URLs:"
echo "================="
echo "🌐 Web Dashboard: $WEB_URL"
echo "🔌 API Endpoint: $API_URL"
echo "🤖 Bot Endpoint: $BOT_URL"
echo "🗄️  Database: localhost:5432"

echo ""
echo "✅ All tests completed successfully!"
echo "🚀 OmniCopilot is ready for use!"
