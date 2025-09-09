import { createHmac, timingSafeEqual } from 'crypto';
import { query } from '@omnicopilot/shared';
import { embedDoc } from './ingest-utils.js';

/**
 * Verify GitHub webhook signature
 */
export function verifyGithubSignature(
  payload: Buffer,
  signature: string,
  secret: string
): boolean {
  if (!signature.startsWith('sha256=')) {
    return false;
  }

  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const calculatedSignature = 'sha256=' + hmac.digest('hex');

  // Use timing-safe comparison
  return timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(calculatedSignature)
  );
}

/**
 * Handle GitHub webhook events
 */
export async function handleGithubWebhook(req: any, res: any): Promise<void> {
  try {
    const signature = req.headers['x-hub-signature-256'];
    const event = req.headers['x-github-event'];
    const payload = req.body;

    // Verify signature
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      console.error('GITHUB_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    if (!signature || !verifyGithubSignature(payload, signature, secret)) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const data = JSON.parse(payload.toString());
    console.log(`📥 Received GitHub webhook: ${event}`);

    try {
      switch (event) {
        case 'pull_request':
          await handlePullRequest(data);
          break;
        case 'push':
          await handlePush(data);
          break;
        default:
          console.log(`⏭️  Ignoring event type: ${event}`);
      }
    } catch (error) {
      console.error(`Error processing ${event} webhook:`, error);
      // Don't return error to GitHub - we've received the webhook successfully
    }

    res.status(200).json({ message: 'Webhook processed' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

/**
 * Handle pull request events
 */
async function handlePullRequest(data: any): Promise<void> {
  const { action, pull_request, repository } = data;
  
  // Only process relevant actions
  if (!['opened', 'edited', 'reopened', 'synchronize', 'closed'].includes(action)) {
    console.log(`⏭️  Ignoring PR action: ${action}`);
    return;
  }

  const externalId = `PR-${pull_request.number}`;
  const title = pull_request.title;
  const url = pull_request.html_url;
  const author = pull_request.user?.login;
  const project = repository?.name;
  const raw = `${title}\n\n${pull_request.body || ''}`;

  try {
    // Upsert the document
    const result = await query(`
      INSERT INTO source_docs (
        source_type, external_id, title, url, author, project, raw, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (source_type, external_id) 
      DO UPDATE SET 
        title = EXCLUDED.title,
        url = EXCLUDED.url,
        raw = EXCLUDED.raw,
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING id
    `, [
      'github_pr',
      externalId,
      title,
      url,
      author,
      project,
      raw,
      JSON.stringify({
        action: action,
        state: pull_request.state,
        draft: pull_request.draft,
        mergeable: pull_request.mergeable,
        repository: repository?.name
      })
    ]);

    const docId = result.rows[0]?.id;
    if (docId) {
      console.log(`📄 Upserted PR document: ${externalId} (ID: ${docId})`);
      
      // Embed the document asynchronously
      embedDoc(docId, raw).catch(error => {
        console.error(`Failed to embed PR ${externalId}:`, error);
      });
    }
  } catch (error) {
    console.error(`Failed to store PR ${externalId}:`, error);
    throw error;
  }
}

/**
 * Handle push events (commits)
 */
async function handlePush(data: any): Promise<void> {
  const { commits, repository } = data;
  
  if (!commits || commits.length === 0) {
    console.log('⏭️  No commits in push event');
    return;
  }

  for (const commit of commits) {
    const externalId = commit.id;
    const title = commit.message.split('\n')[0]; // First line as title
    const url = commit.url;
    const author = commit.author?.name || commit.author?.username;
    const project = repository?.name;
    const raw = commit.message;

    try {
      const result = await query(`
        INSERT INTO source_docs (
          source_type, external_id, title, url, author, project, raw, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (source_type, external_id) DO NOTHING
        RETURNING id
      `, [
        'github_commit',
        externalId,
        title,
        url,
        author,
        project,
        raw,
        JSON.stringify({
          added: commit.added,
          removed: commit.removed,
          modified: commit.modified,
          repository: repository?.name
        })
      ]);

      const docId = result.rows[0]?.id;
      if (docId) {
        console.log(`📄 Stored commit: ${externalId.substring(0, 8)} (ID: ${docId})`);
        
        // Embed the document asynchronously
        embedDoc(docId, raw).catch(error => {
          console.error(`Failed to embed commit ${externalId}:`, error);
        });
      }
    } catch (error) {
      console.error(`Failed to store commit ${externalId}:`, error);
      // Continue processing other commits
    }
  }
}
