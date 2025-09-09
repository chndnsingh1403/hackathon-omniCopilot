import restify from 'restify';
import { CloudAdapter, ConfigurationBotFrameworkAuthentication } from 'botbuilder';
import dotenv from 'dotenv';
import { OmniCopilotBot } from './bot.js';

declare var process: any;

// Load environment variables
dotenv.config();

const port = parseInt(process.env.BOT_PORT || '3978');

// Create bot authentication
const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: process.env.MicrosoftAppId,
  MicrosoftAppPassword: process.env.MicrosoftAppPassword
});

// Create cloud adapter
const adapter = new CloudAdapter(botFrameworkAuthentication);

// Catch-all for errors
adapter.onTurnError = async (context, error) => {
  console.error('[onTurnError] unhandled error:', error);
  
  // Send a message to the user
  await context.sendActivity('Sorry, it looks like something went wrong. Please try again.');
};

// Create the main bot
const bot = new OmniCopilotBot();

// Create HTTP server
const server = restify.createServer({
  name: 'OmniCopilot Bot',
  version: '1.0.0'
});

// Enable CORS for development
server.pre((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.send(200);
    return next(false);
  }
  return next();
});

// Parse request body
server.use(restify.plugins.bodyParser());

// Health check endpoint
server.get('/health', (req, res, next) => {
  res.json({
    ok: true,
    ts: Date.now(),
    service: 'omnicopilot-bot'
  });
  return next();
});

// Bot Framework webhook endpoint
server.post('/api/messages', async (req: any, res: any, next: any) => {
  try {
    await adapter.process(req, res, (context: any) => {
      return bot.run(context);
    });
  } catch (error) {
    console.error('Error processing bot message:', error);
    res.status(500);
    res.json({ error: 'Internal server error' });
  }
  return next();
});

// Start the server
server.listen(port, '0.0.0.0', () => {
  console.log(`🤖 OmniCopilot Bot server running on port ${port}`);
  
  // Log configuration status
  console.log('Configuration status:');
  console.log(`- Microsoft App ID: ${process.env.MicrosoftAppId ? '✅' : '❌'}`);
  console.log(`- Microsoft App Password: ${process.env.MicrosoftAppPassword ? '✅' : '❌'}`);
  console.log(`- API Base URL: ${process.env.API_BASE_URL || 'http://localhost:4000'}`);
  
  if (!process.env.MicrosoftAppId || !process.env.MicrosoftAppPassword) {
    console.warn('⚠️  Bot credentials missing - bot will not work in Teams');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🔄 Bot shutting down gracefully...');
  server.close(() => {
    console.log('✅ Bot server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('🔄 Bot shutting down gracefully...');
  server.close(() => {
    console.log('✅ Bot server closed');
    process.exit(0);
  });
});
