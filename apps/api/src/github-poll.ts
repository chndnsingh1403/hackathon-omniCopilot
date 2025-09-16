import cron from 'node-cron';
import { Octokit } from '@octokit/rest';
import { query } from '@omnicopilot/shared';
import { embedDoc } from './ingest-utils.js';

interface GithubConfig {
  token?: string;
  repositories: string[]; // Format: "owner/repo"
  pollInterval: string; // Cron expression
}

/**
 * Process GitHub content similar to webhook processing
 */
async function processGithubContent(data: any): Promise<void> {
  const { action, repository, commits, head_commit, issue, pull_request } = data;
  
  try {
    if (commits && commits.length > 0) {
      // Handle commits
      for (const commit of commits) {
        await processCommit(commit, repository);
      }
    } else if (head_commit) {
      // Handle single commit
      await processCommit(head_commit, repository);
    } else if (issue) {
      // Handle issue
      await processIssue(issue, repository);
    } else if (pull_request) {
      // Handle pull request
      await processPullRequest(pull_request, repository);
    }
  } catch (error) {
    console.error('Error processing GitHub content:', error);
  }
}

/**
 * Process a single commit
 */
async function processCommit(commit: any, repository: any): Promise<void> {
  const externalId = commit.id || commit.sha;
  const title = commit.message?.split('\n')[0] || 'Commit';
  const url = commit.html_url || commit.url;
  const author = commit.author?.name || commit.author?.username || commit.committer?.name;
  const project = repository?.name;
  const raw = commit.message || '';

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
      console.log(`📄 Stored commit: ${externalId?.substring(0, 8)} (ID: ${docId})`);
      
      // Embed the document asynchronously
      embedDoc(docId, raw).catch(error => {
        console.error(`Failed to embed commit ${externalId}:`, error);
      });
    }
  } catch (error) {
    console.error(`Failed to store commit ${externalId}:`, error);
  }
}

/**
 * Process an issue
 */
async function processIssue(issue: any, repository: any): Promise<void> {
  const externalId = `ISSUE-${issue.number}`;
  const title = issue.title;
  const url = issue.html_url;
  const author = issue.user?.login;
  const project = repository?.name;
  const raw = `${title}\n\n${issue.body || ''}`;

  try {
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
      'github_issue',
      externalId,
      title,
      url,
      author,
      project,
      raw,
      JSON.stringify({
        state: issue.state,
        labels: issue.labels,
        assignees: issue.assignees?.map((a: any) => a.login),
        repository: repository?.name
      })
    ]);

    const docId = result.rows[0]?.id;
    if (docId) {
      console.log(`📄 Upserted issue: ${externalId} (ID: ${docId})`);
      
      // Embed the document asynchronously
      embedDoc(docId, raw).catch(error => {
        console.error(`Failed to embed issue ${externalId}:`, error);
      });
    }
  } catch (error) {
    console.error(`Failed to store issue ${externalId}:`, error);
  }
}

/**
 * Process a pull request
 */
async function processPullRequest(pullRequest: any, repository: any): Promise<void> {
  const externalId = `PR-${pullRequest.number}`;
  const title = pullRequest.title;
  const url = pullRequest.html_url;
  const author = pullRequest.user?.login;
  const project = repository?.name;
  const raw = `${title}\n\n${pullRequest.body || ''}`;

  try {
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
        state: pullRequest.state,
        draft: pullRequest.draft,
        mergeable: pullRequest.mergeable,
        repository: repository?.name
      })
    ]);

    const docId = result.rows[0]?.id;
    if (docId) {
      console.log(`📄 Upserted PR: ${externalId} (ID: ${docId})`);
      
      // Embed the document asynchronously
      embedDoc(docId, raw).catch(error => {
        console.error(`Failed to embed PR ${externalId}:`, error);
      });
    }
  } catch (error) {
    console.error(`Failed to store PR ${externalId}:`, error);
  }
}

class GithubPoller {
  private octokit: Octokit;
  private config: GithubConfig;
  private lastPollTime: { [repo: string]: Date } = {};

  constructor(config: GithubConfig) {
    this.config = config;
    this.octokit = new Octokit({
      auth: config.token,
    });
  }

  async start() {
    console.log(`Starting GitHub polling with interval: ${this.config.pollInterval}`);
    
    // Initialize last poll time for each repository
    for (const repo of this.config.repositories) {
      this.lastPollTime[repo] = new Date(Date.now() - 24 * 60 * 60 * 1000); // Start from 24h ago
    }

    // Start the cron job
    cron.schedule(this.config.pollInterval, async () => {
      await this.pollAllRepositories();
    });

    // Initial poll
    setTimeout(() => this.pollAllRepositories(), 5000);
  }

  private async pollAllRepositories() {
    console.log('Polling GitHub repositories for updates...');
    
    for (const repo of this.config.repositories) {
      try {
        await this.pollRepository(repo);
      } catch (error) {
        console.error(`Error polling repository ${repo}:`, error);
      }
    }
  }

  private async pollRepository(repoString: string) {
    const [owner, repo] = repoString.split('/');
    if (!owner || !repo) {
      console.error(`Invalid repository format: ${repoString}. Expected format: owner/repo`);
      return;
    }

    const since = this.lastPollTime[repoString];
    console.log(`Polling ${repoString} since ${since.toISOString()}`);

    try {
      // Poll for new commits
      await this.pollCommits(owner, repo, since);
      
      // Poll for new/updated issues
      await this.pollIssues(owner, repo, since);
      
      // Poll for new/updated pull requests
      await this.pollPullRequests(owner, repo, since);

      // Update last poll time
      this.lastPollTime[repoString] = new Date();
      
    } catch (error) {
      console.error(`Error polling ${repoString}:`, error);
    }
  }

  private async pollCommits(owner: string, repo: string, since: Date) {
    try {
      const { data: commits } = await this.octokit.repos.listCommits({
        owner,
        repo,
        since: since.toISOString(),
        per_page: 50,
      });

      console.log(`Found ${commits.length} new commits in ${owner}/${repo}`);

      for (const commit of commits) {
        // Create a webhook-like payload for processing
        const webhookPayload = {
          action: 'created',
          repository: {
            name: repo,
            full_name: `${owner}/${repo}`,
            owner: { login: owner },
            description: '',
            clone_url: '',
          },
          commits: [commit],
          head_commit: commit,
        };

        await processGithubContent(webhookPayload);
      }
    } catch (error) {
      console.error(`Error polling commits for ${owner}/${repo}:`, error);
    }
  }

  private async pollIssues(owner: string, repo: string, since: Date) {
    try {
      const { data: issues } = await this.octokit.issues.listForRepo({
        owner,
        repo,
        since: since.toISOString(),
        state: 'all',
        per_page: 50,
      });

      console.log(`Found ${issues.length} updated issues in ${owner}/${repo}`);

      for (const issue of issues) {
        // Skip pull requests (they're returned by issues API but have pull_request property)
        if (issue.pull_request) continue;

        // Create a webhook-like payload for processing
        const webhookPayload = {
          action: 'opened', // Could be opened, updated, etc.
          issue,
          repository: {
            name: repo,
            full_name: `${owner}/${repo}`,
            owner: { login: owner },
            description: '',
            clone_url: '',
          },
        };

        await processGithubContent(webhookPayload);
      }
    } catch (error) {
      console.error(`Error polling issues for ${owner}/${repo}:`, error);
    }
  }

  private async pollPullRequests(owner: string, repo: string, since: Date) {
    try {
      const { data: pullRequests } = await this.octokit.pulls.list({
        owner,
        repo,
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: 50,
      });

      // Filter PRs updated since last poll
      const updatedPRs = pullRequests.filter((pr: any) => 
        new Date(pr.updated_at) > since
      );

      console.log(`Found ${updatedPRs.length} updated pull requests in ${owner}/${repo}`);

      for (const pullRequest of updatedPRs) {
        // Create a webhook-like payload for processing
        const webhookPayload = {
          action: 'opened', // Could be opened, updated, etc.
          pull_request: pullRequest,
          repository: {
            name: repo,
            full_name: `${owner}/${repo}`,
            owner: { login: owner },
            description: '',
            clone_url: '',
          },
        };

        await processGithubContent(webhookPayload);
      }
    } catch (error) {
      console.error(`Error polling pull requests for ${owner}/${repo}:`, error);
    }
  }

  async stop() {
    console.log('Stopping GitHub polling...');
    // Cron jobs will be automatically cleaned up when the process exits
  }
}

let githubPoller: GithubPoller | null = null;

export function startGithubPolling(): void {
  const token = process.env.GITHUB_TOKEN;
  const repositoriesEnv = process.env.GITHUB_REPOSITORIES;
  const pollInterval = process.env.GITHUB_POLL_INTERVAL || '*/5 * * * * *'; // Every 5 seconds

  if (!token) {
    console.log('GITHUB_TOKEN not provided, skipping GitHub polling');
    return;
  }

  if (!repositoriesEnv) {
    console.log('GITHUB_REPOSITORIES not provided, skipping GitHub polling');
    return;
  }

  const repositories = repositoriesEnv.split(',').map((repo: string) => repo.trim());
  
  console.log('Starting GitHub polling for repositories:', repositories);
  
  githubPoller = new GithubPoller({
    token,
    repositories,
    pollInterval,
  });

  githubPoller.start();
}

export function stopGithubPolling(): void {
  if (githubPoller) {
    githubPoller.stop();
    githubPoller = null;
  }
}
