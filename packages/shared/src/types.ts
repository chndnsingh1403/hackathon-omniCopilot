// Type definitions for OmniCopilot

export type SourceType = 'github_pr' | 'github_commit' | 'jira_issue';

export type Role = 'dev' | 'qa' | 'manager';

export interface SourceDoc {
  id: number;
  source_type: SourceType;
  external_id: string;
  title?: string;
  url?: string;
  author?: string;
  project?: string;
  created_at: Date;
  updated_at: Date;
  raw?: string;
  metadata: Record<string, any>;
}

export interface DocChunk {
  id: number;
  doc_id: number;
  chunk_index: number;
  content: string;
  embedding: number[];
}

export interface QueryRequest {
  role: Role;
  question: string;
  project?: string;
}

export interface Citation {
  n: number;
  title: string;
  url: string;
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
  latency_ms: number;
}

export interface HealthResponse {
  ok: boolean;
  ts: number;
}

export interface DigestResponse {
  health_score: number;
  top_risks: string[];
  recent_activity: {
    prs: number;
    commits: number;
    issues: number;
  };
  generated_at: Date;
}
