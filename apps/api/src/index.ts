import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { initializePool, query, type QueryRequest, type QueryResponse, type HealthResponse } from '@omnicopilot/shared';
import { handleGithubWebhook } from './github-webhook.js';
import { startJiraPolling } from './jira-poll.js';
import { startGithubPolling } from './github-poll.js';
import { handleQuery } from './query-handler.js';
import { getDailyDigest } from './digest.js';

// Load environment variables
dotenv.config();

const app = express();
const port = parseInt(process.env.API_PORT || '4000');

// Middleware
app.use(helmet());
app.use(cors());
app.use('/webhooks/github', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

// Initialize database connection
initializePool();

// Health check endpoint
app.get('/health', (req, res) => {
  const response: HealthResponse = {
    ok: true,
    ts: Date.now()
  };
  res.json(response);
});

// GitHub webhook endpoint
app.post('/webhooks/github', handleGithubWebhook);

// Query endpoint for RAG
app.post('/api/query', async (req, res) => {
  try {
    const startTime = Date.now();
    const queryRequest = req.body as QueryRequest;
    
    // Validate request
    if (!queryRequest.question || !queryRequest.role) {
      return res.status(400).json({ 
        error: 'Missing required fields: question and role' 
      });
    }
    
    if (!['dev', 'qa', 'manager'].includes(queryRequest.role)) {
      return res.status(400).json({ 
        error: 'Invalid role. Must be one of: dev, qa, manager' 
      });
    }
    
    const response = await handleQuery(queryRequest);
    response.latency_ms = Date.now() - startTime;
    
    res.json(response);
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Daily digest endpoint
app.get('/api/digest', async (req, res) => {
  try {
    const digest = await getDailyDigest();
    res.json(digest);
  } catch (error) {
    console.error('Digest error:', error);
    res.status(500).json({ 
      error: 'Failed to generate digest',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Error handling
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 OmniCopilot API server running on port ${port}`);
  
  // Log configuration status
  console.log('Configuration status:');
  console.log(`- Database: ${process.env.DATABASE_URL ? '✅' : '❌'}`);
  console.log(`- OpenAI: ${process.env.OPENAI_API_KEY ? '✅' : '❌'}`);
  console.log(`- GitHub Token: ${process.env.GITHUB_TOKEN ? '✅' : '❌'}`);
  console.log(`- GitHub Repositories: ${process.env.GITHUB_REPOSITORIES ? '✅' : '❌'}`);
  console.log(`- Jira: ${process.env.JIRA_BASE_URL && process.env.JIRA_API_TOKEN ? '✅' : '❌'}`);
  
  // Start background services
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORIES) {
    console.log('🔄 Starting GitHub polling service...');
    startGithubPolling();
  } else {
    console.log('⏭️  GitHub polling disabled (missing configuration)');
  }
  
  if (process.env.JIRA_BASE_URL && process.env.JIRA_API_TOKEN && process.env.JIRA_PROJECT_KEYS) {
    console.log('🔄 Starting Jira polling service...');
    startJiraPolling();
  } else {
    console.log('⏭️  Jira polling disabled (missing configuration)');
  }
  
  // Schedule daily digest (every day at 6 AM)
  cron.schedule('0 6 * * *', async () => {
    try {
      console.log('📊 Generating daily digest...');
      await getDailyDigest();
      console.log('✅ Daily digest generated');
    } catch (error) {
      console.error('❌ Failed to generate daily digest:', error);
    }
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🔄 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🔄 Shutting down gracefully...');
  process.exit(0);
});
