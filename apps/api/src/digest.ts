import { query, type DigestResponse } from '@omnicopilot/shared';

/**
 * Generate daily digest with health metrics and top risks
 */
export async function getDailyDigest(): Promise<DigestResponse> {
  try {
    console.log('📊 Generating daily digest...');
    
    // Get recent activity counts (last 7 days)
    const activityResult = await query(`
      SELECT 
        source_type,
        COUNT(*) as count
      FROM source_docs 
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY source_type
    `);
    
    const activity = {
      prs: 0,
      commits: 0,
      issues: 0
    };
    
    for (const row of activityResult.rows) {
      switch (row.source_type) {
        case 'github_pr':
          activity.prs = parseInt(row.count);
          break;
        case 'github_commit':
          activity.commits = parseInt(row.count);
          break;
        case 'jira_issue':
          activity.issues = parseInt(row.count);
          break;
      }
    }
    
    // Calculate health score based on activity and recent updates
    const healthScore = calculateHealthScore(activity);
    
    // Identify top risks based on patterns
    const topRisks = await identifyTopRisks();
    
    const digest: DigestResponse = {
      health_score: healthScore,
      top_risks: topRisks,
      recent_activity: activity,
      generated_at: new Date()
    };
    
    console.log('✅ Daily digest generated');
    return digest;
    
  } catch (error) {
    console.error('Error generating daily digest:', error);
    throw error;
  }
}

/**
 * Calculate health score based on various metrics
 */
function calculateHealthScore(activity: { prs: number; commits: number; issues: number }): number {
  let score = 100;
  
  // Reduce score for low activity
  if (activity.prs < 2) score -= 10;
  if (activity.commits < 10) score -= 15;
  if (activity.issues > activity.prs * 2) score -= 20; // Too many issues vs PRs
  
  // Bonus for balanced activity
  if (activity.prs > 0 && activity.commits > 0) score += 5;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Identify top risks based on document patterns
 */
async function identifyTopRisks(): Promise<string[]> {
  const risks: string[] = [];
  
  try {
    // Check for error-related issues
    const errorResult = await query(`
      SELECT COUNT(*) as count
      FROM source_docs 
      WHERE (
        LOWER(title) LIKE '%error%' 
        OR LOWER(title) LIKE '%fail%' 
        OR LOWER(title) LIKE '%bug%'
        OR LOWER(raw) LIKE '%error%'
      )
      AND created_at > NOW() - INTERVAL '7 days'
    `);
    
    const errorCount = parseInt(errorResult.rows[0]?.count || '0');
    if (errorCount > 5) {
      risks.push(`High error activity: ${errorCount} error-related items in the last 7 days`);
    }
    
    // Check for stale pull requests
    const staleResult = await query(`
      SELECT COUNT(*) as count
      FROM source_docs 
      WHERE source_type = 'github_pr'
      AND created_at < NOW() - INTERVAL '14 days'
      AND updated_at < NOW() - INTERVAL '7 days'
    `);
    
    const staleCount = parseInt(staleResult.rows[0]?.count || '0');
    if (staleCount > 3) {
      risks.push(`Stale pull requests: ${staleCount} PRs haven't been updated in over a week`);
    }
    
    // Check for blocked issues
    const blockedResult = await query(`
      SELECT COUNT(*) as count
      FROM source_docs 
      WHERE source_type = 'jira_issue'
      AND (
        LOWER(raw) LIKE '%blocked%' 
        OR LOWER(raw) LIKE '%blocker%'
        OR metadata->>'status' = 'Blocked'
      )
      AND created_at > NOW() - INTERVAL '30 days'
    `);
    
    const blockedCount = parseInt(blockedResult.rows[0]?.count || '0');
    if (blockedCount > 2) {
      risks.push(`Blocked work items: ${blockedCount} blocked issues in the last 30 days`);
    }
    
    // Check for low commit activity
    const commitResult = await query(`
      SELECT COUNT(*) as count
      FROM source_docs 
      WHERE source_type = 'github_commit'
      AND created_at > NOW() - INTERVAL '3 days'
    `);
    
    const recentCommits = parseInt(commitResult.rows[0]?.count || '0');
    if (recentCommits < 5) {
      risks.push(`Low development activity: Only ${recentCommits} commits in the last 3 days`);
    }
    
    // Default message if no specific risks identified
    if (risks.length === 0) {
      risks.push('No major risks identified based on recent activity');
    }
    
  } catch (error) {
    console.error('Error identifying risks:', error);
    risks.push('Unable to assess risks due to data analysis error');
  }
  
  return risks.slice(0, 5); // Limit to top 5 risks
}
