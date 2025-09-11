appomni# OmniCopilot - AI Development Intelligence Platform


🤖 **OmniCopilot** is an AI-powered development intelligence platform that ingests data from GitHub (via polling by default, or webhooks if available) and Jira, stores it with embeddings in PostgreSQL, and provides intelligent answers through a RAG (Retrieval-Augmented Generation) API, Microsoft Teams bot, and Next.js dashboard.

## ✨ Features

- **📥 Data Ingestion**: Automatically ingests GitHub PRs/commits via polling (default) or webhooks (optional), and Jira issues via polling
- **🧠 AI-Powered Q&A**: Uses AWS Bedrock (Claude, Titan) for embeddings and generation
- **📚 Citations**: Every answer includes numbered citations with clickable URLs
- **🤖 Teams Bot**: Microsoft Teams integration for conversational queries
- **📊 Dashboard**: Next.js web interface with role-based queries and KPI display
- **🐳 Docker Ready**: Complete containerization with docker-compose

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   GitHub API    │    │   Jira API      │    │  Microsoft      │
│   (Webhooks)    │    │   (Polling)     │    │  Teams Bot      │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OmniCopilot API                             │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────────────────┐  │
│  │   Ingest    │ │   RAG Query  │ │      Daily Digest       │  │
│  │   Service   │ │   Handler    │ │       Service           │  │
│  └─────────────┘ └──────────────┘ └─────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
          ┌───────────▼────────────┐
          │  PostgreSQL + pgvector │
          │  ┌─────────────────┐   │
          │  │  source_docs    │   │
          │  │  doc_chunks     │   │
          │  │  + embeddings   │   │
          │  └─────────────────┘   │
          └────────────────────────┘
                      ▲
          ┌───────────┴────────────┐
          │     Next.js Web UI     │
          │   (Role-based Query)   │
          └────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- AWS account with Bedrock access (Claude/Titan models) and credentials
- GitHub webhook secret
- (Optional) Jira API credentials
- (Optional) Microsoft Teams Bot credentials

### 1. Clone and Setup

```bash
git clone <repository-url>
cd omnicopilot
cp .env.example .env
```


### 2. Configure Environment

Edit `.env` and fill in your credentials:

```bash
DATABASE_URL=postgres://omni:omni@db:5432/omni

# LLM (AWS Bedrock)
AWS_REGION=us-east-1
# If not using an instance profile, set standard AWS creds in environment
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
# Optional overrides
# BEDROCK_CHAT_MODEL=anthropic.claude-3-5-sonnet-20240620-v1:0
# BEDROCK_EMBEDDING_MODEL=amazon.titan-embed-text-v2:0

# GitHub Polling (default)
GITHUB_TOKEN=your-github-personal-access-token
GITHUB_REPOSITORIES=owner/repo1,owner/repo2
GITHUB_POLL_INTERVAL=*/5 * * * *

# Optional: GitHub Webhook (if your network allows)
GITHUB_WEBHOOK_SECRET=your-github-webhook-secret

# Optional (for Jira integration)
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEYS=ABC,XYZ

# Optional (for Teams bot)
MicrosoftAppId=your-bot-app-id
MicrosoftAppPassword=your-bot-app-password
```

### 3. Start the Platform

```bash
docker-compose up --build
```

This will start:
- **Database** (PostgreSQL + pgvector) on port 5432
- **API** (Express.js) on port 4000
- **Bot** (Teams Bot) on port 3978
- **Web** (Next.js) on port 3000

### 4. Verify Installation

```bash
# Check API health
curl http://localhost:4000/health

# Test query endpoint
curl -X POST http://localhost:4000/api/query \
  -H "Content-Type: application/json" \
  -d '{"role":"dev","question":"What are the recent issues?"}'

# Open web dashboard
open http://localhost:3000
```

## 🔧 Configuration


### GitHub Integration

By default, OmniCopilot uses polling to ingest GitHub PRs, commits, and issues. This works in restrictive/corporate networks where webhooks are not possible.

**To enable GitHub polling:**

1. [Create a GitHub personal access token](https://github.com/settings/tokens) with `repo` and `read:org` scopes.
2. Set `GITHUB_TOKEN` and `GITHUB_REPOSITORIES` in your `.env` file.
3. (Optional) Adjust `GITHUB_POLL_INTERVAL` (default: every 5 minutes).

**To use GitHub webhooks (optional, if your network allows):**

1. Go to your GitHub repository settings
2. Add a webhook with URL: `https://your-domain.com/webhooks/github`
3. Set content type to `application/json`
4. Set secret to your `GITHUB_WEBHOOK_SECRET`
5. Select events: `Pull requests` and `Pushes`

### Jira Integration

Set these environment variables for automatic Jira polling:

```bash
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-api-token
JIRA_PROJECT_KEYS=PROJ1,PROJ2
```

The system will poll Jira every 2 minutes for recent issues.

### Microsoft Teams Bot

1. Create a Bot Framework registration in Azure
2. Set the messaging endpoint to: `https://your-domain.com/api/messages`
3. Configure the environment variables:
   ```bash
   MicrosoftAppId=your-app-id
   MicrosoftAppPassword=your-app-password
   ```

## 📖 Usage

### Web Dashboard

1. Open http://localhost:3000
2. Select your role (Developer/QA/Manager)
3. Enter a question about your codebase
4. Get AI-powered answers with citations

### Teams Bot

1. Add the bot to your Teams workspace
2. Send messages starting with "omni": 
   ```
   omni why did the login test fail?
   omni what are the deployment issues?
   ```

### API Endpoints

#### Query Endpoint
```bash
POST /api/query
Content-Type: application/json

{
  "role": "dev|qa|manager",
  "question": "Your question here",
  "project": "optional-project-filter"
}
```

#### Health Check
```bash
GET /health
```

#### Daily Digest
```bash
GET /api/digest
```

## 🎯 Example Queries

- **Developer**: "Why did the authentication tests fail in PR #123?"
- **QA Engineer**: "What are the recent bug reports related to payment?"
- **Manager**: "What's the status of the mobile app release?"

## 🏗️ Development

### Project Structure

```
omnicopilot/
├── packages/shared/           # Shared utilities
│   ├── src/
│   │   ├── pg.ts             # Database utilities
│   │   ├── embed.ts          # AWS Bedrock integration
│   │   ├── chunker.ts        # Text chunking
│   │   └── types.ts          # TypeScript types
├── apps/api/                 # Express.js API
│   ├── src/
│   │   ├── index.ts          # Main server
│   │   ├── github-webhook.ts # GitHub integration
│   │   ├── jira-poll.ts      # Jira polling
│   │   ├── query-handler.ts  # RAG implementation
│   │   └── digest.ts         # Daily digest
├── apps/bot/                 # Teams Bot
│   ├── src/
│   │   ├── index.ts          # Bot server
│   │   ├── bot.ts            # Bot logic
│   │   └── card.ts           # Adaptive cards
├── apps/web/                 # Next.js Dashboard
│   ├── src/app/
│   │   ├── page.tsx          # Main UI
│   │   └── layout.tsx        # Layout
└── database/migrations/      # SQL migrations
    └── 001_init.sql          # Initial schema
```

### Local Development

```bash
# Install dependencies
pnpm install

# Start services in development mode
docker-compose -f docker-compose.dev.yml up

# Or run individual services
cd apps/api && pnpm dev
cd apps/bot && pnpm dev
cd apps/web && pnpm dev
```

### Database Management

```bash
# Access database
docker-compose exec db psql -U omni -d omni

# Run migrations manually
docker-compose exec db psql -U omni -d omni -f /migrations/001_init.sql

# Check embeddings
SELECT COUNT(*) FROM doc_chunks;
```

## 🔍 Monitoring & Troubleshooting

### Logs

```bash
# View all service logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f api
docker-compose logs -f bot
docker-compose logs -f web
```

### Health Checks

- API: http://localhost:4000/health
- Bot: http://localhost:3978/health
- Web: http://localhost:3000

### Common Issues

1. **Embeddings not working**: Check AWS credentials, region, and Bedrock model IDs
2. **GitHub polling not working**: Check your GitHub token and repository list
3. **GitHub webhooks failing**: Verify webhook secret and URL (if using webhooks)
3. **Teams bot not responding**: Check bot credentials and endpoint
4. **Database connection issues**: Ensure PostgreSQL is running

## 🧪 Testing

```bash
# Test GitHub webhook
curl -X POST http://localhost:4000/webhooks/github \
  -H "X-GitHub-Event: ping" \
  -H "X-Hub-Signature-256: sha256=..." \
  -d '{"zen":"GitHub webhook test"}'

# Test query with citation
curl -X POST http://localhost:4000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "role": "dev",
    "question": "What are the recent pull requests?",
    "project": "frontend"
  }'
```

## 🔒 Security

- All API endpoints validate input
- GitHub webhooks use HMAC signature verification
- Database uses parameterized queries to prevent SQL injection
- Environment variables keep secrets secure
- CORS configured for web security

## 📊 Performance

- Vector similarity search with pgvector indexes
- Text chunking optimized for embeddings
- Async processing for embedding generation
- Connection pooling for database efficiency
- Caching for improved response times

## 🚀 Deployment

### Production Deployment

1. Set up SSL/TLS certificates
2. Configure reverse proxy (nginx/traefik)
3. Set production environment variables
4. Use production-grade PostgreSQL
5. Configure monitoring and logging

### Environment Variables for Production

```bash
NODE_ENV=production
DATABASE_URL=postgres://user:pass@prod-db:5432/omni
GITHUB_WEBHOOK_SECRET=secure-secret-here
# AWS credentials should be provided via environment or instance profile
# AWS_REGION=us-east-1
# ... other production configs
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support, please:
1. Check the troubleshooting section above
2. Review logs with `docker-compose logs`
3. Open an issue on GitHub
4. Contact the development team

---

**Built with ❤️ for better development intelligence**
