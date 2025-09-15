import cron from 'node-cron';
import { query } from '@omnicopilot/shared';
import { embedDoc, embedDocMulti } from './ingest-utils.js';

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description?: any;
    status: {
      name: string;
    };
    creator: {
      displayName: string;
    };
    sprint?: any; // Add sprint field
  };
}

interface JiraComment {
  body: {
    content: any[];
  };
}

interface JiraAttachment {
  filename: string;
  content: string;
}

interface JiraSearchResponse {
  issues: JiraIssue[];
}

let isPolling = false;

/**
 * Start Jira polling service
 */
export function startJiraPolling(): void {
  const projectKeys = process.env.JIRA_PROJECT_KEYS?.split(',') || [];
  
  if (projectKeys.length === 0) {
    console.log('⏭️  No Jira project keys configured');
    return;
  }

  console.log(`🔄 Starting Jira polling for projects: ${projectKeys.join(', ')}`);
  
  // Poll every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    if (isPolling) {
      console.log('⏭️  Jira poll already in progress, skipping...');
      return;
    }

    try {
      isPolling = true;
      await pollJiraIssues();
    } catch (error) {
      console.error('❌ Jira polling error:', error);
    } finally {
      isPolling = false;
    }
  });

  // Run initial poll
  setTimeout(() => {
    pollJiraIssues().catch(error => {
      console.error('❌ Initial Jira poll error:', error);
    });
  }, 5000);
}

/**
 * Poll Jira for recent issues
 */
async function pollJiraIssues(): Promise<void> {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  const projectKeys = process.env.JIRA_PROJECT_KEYS?.split(',') || [];

  if (!baseUrl || !email || !apiToken) {
    console.error('❌ Missing Jira configuration');
    return;
  }

  console.log('🔍 Polling Jira for recent issues...');

  for (const projectKey of projectKeys) {
    try {
      const jql = `project = "${projectKey.trim()}" ORDER BY updated DESC`;
      const url = `${baseUrl}/rest/api/3/search`;
      const params = new URLSearchParams({
        jql: jql,
        maxResults: '20',
        fields: 'summary,description,status,creator,sprint' // Add sprint field
      });

      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
      }

      const data: JiraSearchResponse = await response.json();
      console.log(`📥 Found ${data.issues.length} issues in project ${projectKey}`);

      for (const issue of data.issues) {
        await processJiraIssue(issue, projectKey.trim());
      }
    } catch (error) {
      console.error(`❌ Error polling project ${projectKey}:`, error);
    }
  }
}

/**
 * Process a single Jira issue
 */
async function processJiraIssue(issue: JiraIssue, projectKey: string): Promise<void> {
  const externalId = issue.key;
  const title = issue.fields.summary;
  const baseUrl = process.env.JIRA_BASE_URL;
  const url = `${baseUrl}/browse/${issue.key}`;
  const author = issue.fields.creator.displayName;
  
  // Convert ADF description to plain text (best effort)
  let description = '';
  if (issue.fields.description) {
    description = convertAdfToText(issue.fields.description);
  }

  // Fetch comments
  const comments = await fetchJiraComments(issue.key);
  const commentsTextArr = comments.map(comment => convertAdfToText(comment.body));

  // Fetch attachments
  const attachments = await fetchJiraAttachments(issue.key);
  const attachmentsTextArr = attachments.map(attachment => `Attachment: ${attachment.filename}`);

  const raw = [title, description, ...commentsTextArr, ...attachmentsTextArr].filter(Boolean).join('\n\n');
  const metadata = {
    status: issue.fields.status.name,
    project: projectKey,
    sprint: issue.fields.sprint ? (issue.fields.sprint.name || issue.fields.sprint.id || issue.fields.sprint) : undefined
  };

  try {
    const result = await query(`
      INSERT INTO source_docs (
        source_type, external_id, title, url, author, project, raw, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (source_type, external_id) 
      DO UPDATE SET 
        title = EXCLUDED.title,
        raw = EXCLUDED.raw,
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING id, (xmax = 0) as was_inserted
    `, [
      'jira_issue',
      externalId,
      title,
      url,
      author,
      projectKey,
      raw,
      JSON.stringify(metadata)
    ]);

    const row = result.rows[0];
    if (row) {
      const action = row.was_inserted ? 'Stored' : 'Updated';
      console.log(`📄 ${action} Jira issue: ${externalId} (ID: ${row.id})`);
      // Embed description, comments, and attachments as sequential chunks
      const texts = [title, description, ...commentsTextArr, ...attachmentsTextArr];
      await embedDocMulti(row.id, texts);
    }
  } catch (error) {
    console.error(`Failed to store Jira issue ${externalId}:`, error);
  }
}

/**
 * Fetch comments for a Jira issue
 */
async function fetchJiraComments(issueKey: string): Promise<JiraComment[]> {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    console.error('❌ Missing Jira configuration');
    return [];
  }

  try {
    const url = `${baseUrl}/rest/api/3/issue/${issueKey}/comment`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.comments || [];
  } catch (error) {
    console.error(`Failed to fetch comments for issue ${issueKey}:`, error);
    return [];
  }
}

/**
 * Fetch attachments for a Jira issue
 */
async function fetchJiraAttachments(issueKey: string): Promise<JiraAttachment[]> {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    console.error('❌ Missing Jira configuration');
    return [];
  }

  try {
    const url = `${baseUrl}/rest/api/3/issue/${issueKey}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.fields.attachment || [];
  } catch (error) {
    console.error(`Failed to fetch attachments for issue ${issueKey}:`, error);
    return [];
  }
}

/**
 * Convert Atlassian Document Format (ADF) to plain text
 * This is a simplified converter - in production, consider using @atlaskit/adf-utils
 */
function convertAdfToText(adf: any): string {
  if (!adf || typeof adf !== 'object') {
    return '';
  }

  if (typeof adf === 'string') {
    return adf;
  }

  let text = '';

  // Handle different node types
  switch (adf.type) {
    case 'doc':
    case 'paragraph':
    case 'blockquote':
    case 'listItem':
      if (adf.content) {
        text += adf.content.map(convertAdfToText).join('');
      }
      if (adf.type === 'paragraph') {
        text += '\n';
      }
      break;
    
    case 'text':
      text += adf.text || '';
      break;
    
    case 'hardBreak':
      text += '\n';
      break;
    
    case 'heading':
      if (adf.content) {
        text += '\n' + adf.content.map(convertAdfToText).join('') + '\n';
      }
      break;
    
    case 'bulletList':
    case 'orderedList':
      if (adf.content) {
        text += '\n' + adf.content.map(convertAdfToText).join('\n') + '\n';
      }
      break;
    
    case 'codeBlock':
      if (adf.content) {
        text += '\n```\n' + adf.content.map(convertAdfToText).join('') + '\n```\n';
      }
      break;
    
    default:
      // For unknown types, try to extract text from content
      if (adf.content) {
        text += adf.content.map(convertAdfToText).join('');
      }
      if (adf.text) {
        text += adf.text;
      }
  }

  return text;
}
