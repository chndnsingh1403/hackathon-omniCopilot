import dotenv from 'dotenv';
dotenv.config();
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
let bedrock: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrock) {
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
    if (!region) throw new Error('AWS_REGION is required for Bedrock');
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const sessionToken = process.env.AWS_SESSION_TOKEN;
    const credentials = accessKeyId && secretAccessKey
      ? { accessKeyId, secretAccessKey, sessionToken }
      : undefined;
    bedrock = new BedrockRuntimeClient({ region, credentials });
    console.log('✅ AWS Bedrock client initialized');
  }
  return bedrock;
}

/**
 * Create embeddings for text using OpenAI
 */
export async function embed(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }
  const client = getBedrockClient();
  const modelId = process.env.BEDROCK_EMBEDDING_MODEL || 'amazon.titan-embed-text-v1';
  const body = {
    inputText: text.trim()
  } as any;
  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: Buffer.from(JSON.stringify(body))
  });
  const resp = await client.send(command);
  const json = JSON.parse(Buffer.from(resp.body as Uint8Array).toString('utf-8')) as { embedding: number[] };
  if (!json.embedding || !Array.isArray(json.embedding)) {
    throw new Error('No embedding returned from Bedrock');
  }
  const targetDim = 1536;
  const vec = json.embedding;
  if (vec.length === targetDim) return vec;
  // Normalize to DB dimension to avoid INSERT errors
  if (vec.length < targetDim) {
    const padded = vec.concat(Array(targetDim - vec.length).fill(0));
    return padded.slice(0, targetDim);
  }
  return vec.slice(0, targetDim);
}

/**
 * Create chat completion using OpenAI
 */
export async function createChatCompletion(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: { max_tokens?: number; temperature?: number } = {}
): Promise<string> {
  const client = getBedrockClient();
  const modelId = process.env.BEDROCK_CHAT_MODEL || 'anthropic.claude-3-5-sonnet-20240620-v1:0';
  const systemParts: string[] = [];
  const chatMessages: any[] = [];
  for (const m of messages) {
    if (m.role === 'system' && m.content) systemParts.push(m.content);
    else if ((m.role === 'user' || m.role === 'assistant') && m.content)
      chatMessages.push({ role: m.role, content: [{ type: 'text', text: m.content }] });
  }
  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: options.max_tokens || 2000,
    temperature: options.temperature ?? 0.1,
    system: systemParts.join('\n\n').trim() || undefined,
    messages: chatMessages
  } as any;
  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: Buffer.from(JSON.stringify(body))
  });
  const resp = await client.send(command);
  const json = JSON.parse(Buffer.from(resp.body as Uint8Array).toString('utf-8')) as any;
  const content = json?.content?.[0]?.text || json?.output_text || '';
  if (!content) throw new Error('No response content from Bedrock');
  return content;
}

/**
 * Sleep utility for backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
