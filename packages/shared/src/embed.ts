import OpenAI from 'openai';

let openai: OpenAI | null = null;

/**
 * Initialize OpenAI client
 */
function getOpenAIClient(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    openai = new OpenAI({
      apiKey: apiKey,
    });
    
    console.log('✅ OpenAI client initialized');
  }
  
  return openai;
}

/**
 * Create embeddings for text using OpenAI
 */
export async function embed(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  const client = getOpenAIClient();
  const model = process.env.MODEL_EMBEDDING || 'text-embedding-3-small';
  
  let attempt = 0;
  const maxAttempts = 3;
  
  while (attempt < maxAttempts) {
    try {
      const response = await client.embeddings.create({
        model: model,
        input: text.trim(),
      });
      
      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned from OpenAI');
      }
      
      // Validate embedding length for text-embedding-3-small
      if (embedding.length !== 1536) {
        throw new Error(`Expected embedding length 1536, got ${embedding.length}`);
      }
      
      return embedding;
      
    } catch (error: any) {
      attempt++;
      
      // Check if it's a rate limit error (429) or server error (5xx)
      const isRetryable = error?.status === 429 || 
                         (error?.status >= 500 && error?.status < 600);
      
      if (isRetryable && attempt < maxAttempts) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.warn(`Embedding attempt ${attempt} failed, retrying in ${backoffMs}ms...`);
        await sleep(backoffMs);
        continue;
      }
      
      console.error('Failed to create embedding:', error);
      throw new Error(`Failed to create embedding after ${attempt} attempts: ${error.message}`);
    }
  }
  
  throw new Error('Max retry attempts exceeded');
}

/**
 * Create chat completion using OpenAI
 */
export async function createChatCompletion(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  options: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParams> = {}
): Promise<string> {
  const client = getOpenAIClient();
  const model = process.env.MODEL_COMPLETION || 'gpt-4';
  
  try {
    const response = await client.chat.completions.create({
      model: model,
      messages: messages,
      temperature: 0.1,
      max_tokens: 2000,
      stream: false, // Ensure non-streaming response
      ...options,
    });
    
    // Type assertion since we know it's not a stream due to stream: false
    const completion = response as any;
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from OpenAI');
    }
    
    return content;
    
  } catch (error: any) {
    console.error('Chat completion error:', error);
    throw new Error(`Chat completion failed: ${error.message}`);
  }
}

/**
 * Sleep utility for backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
