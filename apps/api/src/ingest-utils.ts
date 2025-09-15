import { query, chunkText, embed } from '@omnicopilot/shared';

/**
 * Embed a document by splitting it into chunks and storing embeddings
 */
export async function embedDoc(docId: number, text: string, startChunkIndex: number = 0): Promise<void> {
  if (!text || text.trim().length === 0) {
    console.log(`⏭️  Skipping empty document ${docId}`);
    return;
  }

  try {
    console.log(`🔄 Embedding document ${docId}...`);
    
    // Delete existing chunks for this document
    await query('DELETE FROM doc_chunks WHERE doc_id = $1', [docId]);
    
    // Split text into chunks
    const chunks = chunkText(text, { maxChunkSize: 2000, overlap: 150 });
    console.log(`📝 Split document ${docId} into ${chunks.length} chunks`);
    
    // Process chunks in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (chunk, batchIndex) => {
          const chunkIndex = startChunkIndex + i + batchIndex;
          
          try {
            // Generate embedding
            const embedding = await embed(chunk);
            
            // Store chunk with embedding
            await query(`
              INSERT INTO doc_chunks (doc_id, chunk_index, content, embedding)
              VALUES ($1, $2, $3, $4)
            `, [docId, chunkIndex, chunk, JSON.stringify(embedding)]);
            
            console.log(`✅ Embedded chunk ${chunkIndex} for document ${docId}`);
          } catch (error) {
            console.error(`❌ Failed to embed chunk ${chunkIndex} for document ${docId}:`, error);
            // Continue processing other chunks
          }
        })
      );
      
      // Small delay between batches to respect rate limits
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`✅ Completed embedding document ${docId}`);
  } catch (error) {
    console.error(`❌ Failed to embed document ${docId}:`, error);
    throw error;
  }
}

/**
 * Embed multiple texts as sequential chunks for a document
 */
export async function embedDocMulti(docId: number, texts: string[]): Promise<void> {
  if (!texts || texts.length === 0) return;
  // Delete existing chunks for this document
  await query('DELETE FROM doc_chunks WHERE doc_id = $1', [docId]);
  let chunkIndex = 0;
  for (const text of texts) {
    if (!text || text.trim().length === 0) continue;
    const chunks = chunkText(text, { maxChunkSize: 2000, overlap: 150 });
    for (const chunk of chunks) {
      try {
        const embedding = await embed(chunk);
        await query(
          `INSERT INTO doc_chunks (doc_id, chunk_index, content, embedding) VALUES ($1, $2, $3, $4)`,
          [docId, chunkIndex, chunk, JSON.stringify(embedding)]
        );
        console.log(`✅ Embedded chunk ${chunkIndex} for document ${docId}`);
        chunkIndex++;
      } catch (error) {
        console.error(`❌ Failed to embed chunk ${chunkIndex} for document ${docId}:`, error);
      }
    }
  }
}

/**
 * Search for relevant chunks using vector similarity
 */
export async function searchSimilarChunks(
  queryEmbedding: number[],
  limit: number = 12,
  project?: string
): Promise<Array<{
  chunk_id: number;
  doc_id: number;
  content: string;
  similarity: number;
  title?: string;
  url?: string;
  source_type: string;
  external_id: string;
}>> {
  try {
    let searchQuery = `
      SELECT 
        dc.id as chunk_id,
        dc.doc_id,
        dc.content,
        1 - (dc.embedding <-> $1::vector) as similarity,
        sd.title,
        sd.url,
        sd.source_type,
        sd.external_id
      FROM doc_chunks dc
      JOIN source_docs sd ON dc.doc_id = sd.id
    `;
    
    const params: any[] = [JSON.stringify(queryEmbedding)];
    
    if (project) {
      searchQuery += ' WHERE sd.project = $2';
      params.push(project);
    }
    
    searchQuery += `
      ORDER BY dc.embedding <-> $1::vector
      LIMIT $${params.length + 1}
    `;
    
    params.push(limit);
    
    const result = await query(searchQuery, params);
    
    return result.rows.map(row => ({
      chunk_id: row.chunk_id,
      doc_id: row.doc_id,
      content: row.content,
      similarity: parseFloat(row.similarity),
      title: row.title,
      url: row.url,
      source_type: row.source_type,
      external_id: row.external_id
    }));
  } catch (error) {
    console.error('Error searching similar chunks:', error);
    throw error;
  }
}

/**
 * Get document statistics
 */
export async function getDocumentStats(): Promise<{
  total_docs: number;
  total_chunks: number;
  by_source_type: Record<string, number>;
  recent_docs: number;
}> {
  try {
    // Get total counts
    const totalResult = await query(`
      SELECT 
        COUNT(*) as total_docs,
        COUNT(DISTINCT dc.id) as total_chunks
      FROM source_docs sd
      LEFT JOIN doc_chunks dc ON sd.id = dc.doc_id
    `);
    
    // Get counts by source type
    const typeResult = await query(`
      SELECT source_type, COUNT(*) as count
      FROM source_docs
      GROUP BY source_type
    `);
    
    // Get recent documents (last 24 hours)
    const recentResult = await query(`
      SELECT COUNT(*) as count
      FROM source_docs
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    
    const bySourceType: Record<string, number> = {};
    for (const row of typeResult.rows) {
      bySourceType[row.source_type] = parseInt(row.count);
    }
    
    return {
      total_docs: parseInt(totalResult.rows[0]?.total_docs || '0'),
      total_chunks: parseInt(totalResult.rows[0]?.total_chunks || '0'),
      by_source_type: bySourceType,
      recent_docs: parseInt(recentResult.rows[0]?.count || '0')
    };
  } catch (error) {
    console.error('Error getting document stats:', error);
    throw error;
  }
}
