-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create source_docs table for storing documents from GitHub and Jira
CREATE TABLE IF NOT EXISTS source_docs (
    id BIGSERIAL PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('github_pr', 'github_commit', 'jira_issue')),
    external_id TEXT NOT NULL,
    title TEXT,
    url TEXT,
    author TEXT,
    project TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    raw TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(source_type, external_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_source_docs_external_id ON source_docs(external_id);
CREATE INDEX IF NOT EXISTS idx_source_docs_source_type ON source_docs(source_type);
CREATE INDEX IF NOT EXISTS idx_source_docs_project ON source_docs(project);
CREATE INDEX IF NOT EXISTS idx_source_docs_created_at ON source_docs(created_at);

-- Create doc_chunks table for storing text chunks with embeddings
CREATE TABLE IF NOT EXISTS doc_chunks (
    id BIGSERIAL PRIMARY KEY,
    doc_id BIGINT REFERENCES source_docs(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536) NOT NULL,
    UNIQUE(doc_id, chunk_index)
);

-- Create vector index for similarity search
CREATE INDEX IF NOT EXISTS idx_doc_chunks_embedding 
ON doc_chunks USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc_id ON doc_chunks(doc_id);
