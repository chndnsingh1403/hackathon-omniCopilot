import { embed, createChatCompletion, type QueryRequest, type QueryResponse, type Citation } from '@omnicopilot/shared';
import { searchSimilarChunks } from './ingest-utils.js';

/**
 * Handle RAG query with role-based context and citations
 */
export async function handleQuery(request: QueryRequest): Promise<QueryResponse> {
  const { role, question, project } = request;
  
  try {
    console.log(`🔍 Processing query for ${role}: ${question}`);
    
    // Generate embedding for the question
    const questionEmbedding = await embed(question);
    
    // Search for relevant chunks
    const similarChunks = await searchSimilarChunks(questionEmbedding, 12, project);
    
    if (similarChunks.length === 0) {
      return {
        answer: "I don't have enough context to answer this question. Please try rephrasing or check if the relevant documents have been ingested.",
        citations: [],
        latency_ms: 0
      };
    }
    
    // Select top 4 most relevant chunks and build citations
    const topChunks = similarChunks.slice(0, 4);
    const citations: Citation[] = [];
    const citationMap = new Map<string, number>();
    
    // Build context with numbered citations
    let context = '';
    topChunks.forEach((chunk, index) => {
      const citationKey = `${chunk.external_id}-${chunk.doc_id}`;
      let citationNumber = citationMap.get(citationKey);
      
      if (!citationNumber) {
        citationNumber = citations.length + 1;
        citationMap.set(citationKey, citationNumber);
        citations.push({
          n: citationNumber,
          title: chunk.title || chunk.external_id,
          url: chunk.url || '#'
        });
      }
      
      context += `[${citationNumber}] ${chunk.content}\n\n`;
    });
    
    // Build role-specific system prompt
    const systemPrompt = buildSystemPrompt(role);
    
    // Create chat completion
    const answer = await createChatCompletion([
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: `Context:\n${context}\n\nQuestion: ${question}\n\nPlease provide a comprehensive answer using ONLY the provided context. Every claim must be cited with [n] references.`
      }
    ]);
    
    console.log(`✅ Generated answer with ${citations.length} citations`);
    
    return {
      answer: answer.trim(),
      citations,
      latency_ms: 0 // Will be set by caller
    };
    
  } catch (error) {
    console.error('Query handling error:', error);
    throw new Error(`Failed to process query: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Build role-specific system prompt
 */
function buildSystemPrompt(role: string): string {
  const basePrompt = `You are OmniCopilot, an AI assistant that helps teams understand their development activities through GitHub PRs, commits, and Jira issues.

CRITICAL INSTRUCTIONS:
- Use ONLY the provided context to answer questions
- Every factual claim MUST include a citation in the format [n] where n is the citation number
- If the context is insufficient, clearly state that you don't have enough information
- Be concise but comprehensive
- Include clickable URLs when available`;

  const roleSpecificPrompts = {
    dev: `${basePrompt}

You are helping a DEVELOPER. Focus on:
- Technical details about code changes, bugs, and implementations
- Pull request discussions and code review feedback
- Commit messages and technical decisions
- Development blockers and solutions`,

    qa: `${basePrompt}

You are helping a QA ENGINEER. Focus on:
- Bug reports and testing issues
- Quality concerns in pull requests
- Test failures and debugging information
- Release readiness and quality metrics`,

    manager: `${basePrompt}

You are helping a PROJECT MANAGER. Focus on:
- Project progress and deliverable status
- Team productivity and collaboration patterns
- Risk identification and mitigation
- High-level summaries and business impact`
  };

  return roleSpecificPrompts[role as keyof typeof roleSpecificPrompts] || roleSpecificPrompts.dev;
}
