import { ActivityHandler, TurnContext, MessageFactory, CardFactory } from 'botbuilder';
import { buildAnswerCard } from './card.js';
import type { QueryRequest, QueryResponse } from '@omnicopilot/shared';

declare var process: any;

export class OmniCopilotBot extends ActivityHandler {
  constructor() {
    super();

    // Handle incoming messages
    this.onMessage(async (context, next) => {
      await this.handleMessage(context);
      await next();
    });

    // Handle members added
    this.onMembersAdded(async (context, next) => {
      const welcomeText = `👋 Hello! I'm OmniCopilot, your AI assistant for development intelligence.\n\n` +
        `Ask me questions about your code, PRs, commits, and Jira issues by starting your message with "omni".\n\n` +
        `Example: "omni why did the login test fail?"`;

      for (const member of context.activity.membersAdded || []) {
        if (member.id !== context.activity.recipient.id) {
          await context.sendActivity(MessageFactory.text(welcomeText));
        }
      }
      await next();
    });
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(context: TurnContext): Promise<void> {
    const text = context.activity.text?.trim() || '';
    
    // Check if message starts with "omni" trigger
    if (!text.toLowerCase().startsWith('omni')) {
      // Ignore messages that don't start with our trigger
      return;
    }

    // Extract the question (everything after "omni")
    const question = text.substring(4).trim();
    
    if (!question) {
      await context.sendActivity(MessageFactory.text(
        'Please ask me a question! For example: "omni why did the deployment fail?"'
      ));
      return;
    }

    // Show typing indicator
    await context.sendActivity({ type: 'typing' });

    try {
      console.log(`🤖 Bot query: ${question}`);
      
      // Query the API
      const response = await this.queryAPI(question);
      
      if (response.citations.length > 0) {
        // Send adaptive card with citations
        const card = buildAnswerCard(response);
        const cardActivity = MessageFactory.attachment(CardFactory.adaptiveCard(card));
        await context.sendActivity(cardActivity);
      } else {
        // Send plain text response
        await context.sendActivity(MessageFactory.text(response.answer));
      }
      
      console.log(`✅ Bot response sent (${response.latency_ms}ms)`);
      
    } catch (error) {
      console.error('Bot error:', error);
      
      const errorMessage = 'Sorry, I encountered an error processing your request. ' +
        'Please try again or contact your administrator if the problem persists.';
      
      await context.sendActivity(MessageFactory.text(errorMessage));
    }
  }

  /**
   * Query the API service
   */
  private async queryAPI(question: string): Promise<QueryResponse> {
    const apiUrl = process.env.API_BASE_URL || 'http://localhost:4000';
    
    const queryRequest: QueryRequest = {
      role: 'dev', // Default role for bot queries
      question: question
    };

    const response = await fetch(`${apiUrl}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(queryRequest)
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Main entry point for the bot
   */
  async run(context: any): Promise<void> {
    await super.run(context);
  }
}
