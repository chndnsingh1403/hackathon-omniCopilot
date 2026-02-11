import { embed, createChatCompletion, type QueryRequest, type QueryResponse, type Citation } from '@omnicopilot/shared';
import { searchSimilarChunks } from './ingest-utils.js';
import { Octokit } from '@octokit/rest';

// Utility: Search for a class in the GitHub codebase
async function searchClassInGithub(className: string, repo: string, githubToken: string): Promise<any[]> {
  const octokit = new Octokit({ auth: githubToken });
  // Search for class definition in code
  const q = `class ${className} in:file repo:${repo}`;
  const result = await octokit.search.code({ q });
  return result.data.items || [];
}

// Utility: Get recent commits for a file
async function getFileCommits(repo: string, filePath: string, githubToken: string): Promise<any[]> {
  const octokit = new Octokit({ auth: githubToken });
  const [owner, repoName] = repo.split('/');
  const result = await octokit.repos.listCommits({ owner, repo: repoName, path: filePath, per_page: 5 });
  return result.data || [];
}

// Utility: Generate RCA for a class
async function generateClassRCA(className: string, repo: string, githubToken: string): Promise<string> {
  const found = await searchClassInGithub(className, repo, githubToken);
  if (!found.length) {
    return `Class \\"${className}\\" was not found in the repository \\"${repo}\\".`;
  }
  const file = found[0];
  const filePath = file.path;
  let rca = `Class \\"${className}\\" found in file: \\"${filePath}\\".`;
  // Get recent commits for this file
  const commits = await getFileCommits(repo, filePath, githubToken);
  if (commits.length) {
    rca += ` Recent changes:\n`;
    for (const commit of commits) {
      rca += `- ${commit.commit.author.date}: ${commit.commit.message.split('\n')[0]}\n`;
    }
  }
  rca += `\nReview the class implementation and recent changes for possible causes of deployment failure.`;
  return rca;
}

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
    
    // After context is built, check for deployment failure and class name
    let rcaNote = '';
    let className: string | undefined;
    if ((role === 'dev' || role === 'manager') && /deployment fail/i.test(question)) {
      // Try to extract class name from question
      const classMatch = question.match(/class ([A-Za-z0-9_]+)/i);
      className = classMatch ? classMatch[1] : undefined;
      // If not found in question, try to extract from context (logs/errors)
      if (!className) {
        // Look for patterns like 'TypeError: ... in ClassName' or 'at ClassName' or 'in the ClassName'
        const contextClassMatch = context.match(/(?:in |at |for |of |from |by |on |to |with )([A-Z][A-Za-z0-9_]+)/);
        if (contextClassMatch) {
          className = contextClassMatch[1];
        } else {
          // Try to find a class name in a TypeError or stack trace
          const typeErrorMatch = context.match(/([A-Z][A-Za-z0-9_]+)\.(?:[a-zA-Z0-9_]+)\s*\(/);
          if (typeErrorMatch) {
            className = typeErrorMatch[1];
          }
        }
      }
      const githubToken = process.env.GITHUB_TOKEN;
      const githubRepos = process.env.GITHUB_REPOSITORIES?.split(',') || [];
      if (className && githubToken && githubRepos.length) {
        // For demo, just use the first repo
        const repo = githubRepos[0].trim();
        try {
          rcaNote = await generateClassRCA(className, repo, githubToken);
        } catch (e) {
          rcaNote = 'Could not fetch RCA from GitHub due to an error.';
        }
      }
    }

    console.log(`✅ Generated answer with ${citations.length} citations`);
    
    return {
      answer: rcaNote ? `${answer.trim()}\n\n---\nRCA: ${rcaNote}` : answer.trim(),
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
- Bugs: Summarize any recent or open bugs, their status, and related discussions
- Pull Requests: List and describe any PRs raised by or assigned to the developer, including their status and review feedback
- Deployment Failures: Highlight any recent deployment failures, their causes, and related issue/PR discussions
- Provide actionable technical insights to help resolve blockers or improve code quality`,

    qa: `${basePrompt}

You are helping a QA ENGINEER. Focus on:
- JIRA Issues: List JIRA issues for which a PR has been raised recently
- New Features: Identify any new features that have been merged or are in progress so QA can plan or start automation testing
- Test Failures: Summarize any recent test failures and their context
- Provide information that helps QA prioritize and plan their work`,

    manager: `${basePrompt}

You are helping a PROJECT MANAGER. Focus on:
- JIRA Issues: Summarize all open and critical issues in JIRA, including blockers and their impact
- Project Health: Assess the overall health of the project based on recent activity, open issues, and deployment status
- Release Impact: Explain how current issues and progress may impact upcoming releases
- Provide high-level summaries and risk assessments for decision making`
  };

  return roleSpecificPrompts[role as keyof typeof roleSpecificPrompts] || roleSpecificPrompts.dev;
}

/**
 * Get default questions for each role
 */
export function getDefaultQuestionsForRole(role: string): string[] {
  const defaults = {
    manager: [
      'What is the project status?',
      'What is the impact on the release?',
      'Are there any critical blockers for the release?'
    ],
    dev: [
      'Why did the deployment fail?',
      'What bugs are currently open?',
      'Are there any new PRs assigned to me?'
    ],
    qa: [
      'Any new feature added for writing test cases?',
      'Which JIRA issues have PRs raised recently?',
      'What are the recent test failures?'
    ]
  };
  return defaults[role as keyof typeof defaults] || [];
}
