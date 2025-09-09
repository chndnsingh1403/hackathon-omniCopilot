import type { QueryResponse } from '@omnicopilot/shared';

/**
 * Build an Adaptive Card for displaying query answers with citations
 */
export function buildAnswerCard(response: QueryResponse): any {
  const { answer, citations } = response;
  
  // Build citation actions (limit to 3 for card readability)
  const citationActions = citations.slice(0, 3).map(citation => ({
    type: 'Action.OpenUrl',
    title: `[${citation.n}] ${citation.title}`,
    url: citation.url
  }));

  const card = {
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'Container',
        items: [
          {
            type: 'TextBlock',
            text: '🤖 OmniCopilot',
            weight: 'Bolder',
            size: 'Medium',
            color: 'Accent'
          },
          {
            type: 'TextBlock',
            text: answer,
            wrap: true,
            spacing: 'Medium'
          }
        ]
      }
    ]
  };

  // Add citation actions if available
  if (citationActions.length > 0) {
    card.body.push({
      type: 'Container',
      items: [
      {
        type: 'TextBlock',
        text: '📚 Sources:',
        weight: 'Bolder',
        size: 'Small',
        color: 'Default'
      }
      ]
    });

    // Add actions property to the card
    (card as any).actions = citationActions;
  }

  // Add footer
  card.body.push({
    type: 'Container',
    items: [
      {
        type: 'TextBlock',
        text: `⚡ Answered in ${response.latency_ms}ms`,
        weight: 'Lighter',
        size: 'Small',
        color: 'Good'
      }
    ]
  });

  return card;
}

/**
 * Build a simple text card for basic responses
 */
export function buildSimpleCard(title: string, message: string): any {
  return {
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'Container',
        items: [
          {
            type: 'TextBlock',
            text: title,
            weight: 'Bolder',
            size: 'Medium',
            color: 'Accent'
          },
          {
            type: 'TextBlock',
            text: message,
            wrap: true,
            spacing: 'Medium'
          }
        ]
      }
    ]
  };
}

/**
 * Build an error card
 */
export function buildErrorCard(message: string): any {
  return {
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'Container',
        items: [
          {
            type: 'TextBlock',
            text: '❌ Error',
            weight: 'Bolder',
            size: 'Medium',
            color: 'Attention'
          },
          {
            type: 'TextBlock',
            text: message,
            wrap: true,
            spacing: 'Medium'
          }
        ]
      }
    ]
  };
}
