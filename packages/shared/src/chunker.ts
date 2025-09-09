/**
 * Text chunking utilities for processing documents
 */

export interface ChunkOptions {
  maxChunkSize?: number;
  overlap?: number;
}

/**
 * Split text into chunks with sentence boundary awareness
 */
export function chunkText(
  text: string, 
  options: ChunkOptions = {}
): string[] {
  const { maxChunkSize = 2000, overlap = 150 } = options;
  
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Normalize whitespace
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  
  if (normalizedText.length <= maxChunkSize) {
    return [normalizedText];
  }

  const chunks: string[] = [];
  const sentences = splitIntoSentences(normalizedText);
  
  let currentChunk = '';
  let i = 0;

  while (i < sentences.length) {
    const sentence = sentences[i];
    
    // If adding this sentence would exceed max size
    if (currentChunk.length + sentence.length + 1 > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        
        // Create overlap by including some previous content
        currentChunk = createOverlap(currentChunk, overlap);
      }
      
      // If single sentence is too long, split by words
      if (sentence.length > maxChunkSize) {
        const wordChunks = splitLongSentence(sentence, maxChunkSize);
        chunks.push(...wordChunks);
        currentChunk = wordChunks[wordChunks.length - 1];
      } else {
        currentChunk = sentence;
      }
    } else {
      // Add sentence to current chunk
      if (currentChunk) {
        currentChunk += ' ' + sentence;
      } else {
        currentChunk = sentence;
      }
    }
    
    i++;
  }

  // Add final chunk if not empty
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Split text into sentences using common punctuation
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence endings while preserving them
  return text
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => sentence.trim().length > 0);
}

/**
 * Create overlap content from the end of a chunk
 */
function createOverlap(chunk: string, overlapSize: number): string {
  if (chunk.length <= overlapSize) {
    return chunk;
  }
  
  // Try to find a good break point (end of sentence or word)
  const endPart = chunk.slice(-overlapSize);
  const sentenceMatch = endPart.match(/[.!?]\s+(.+)$/);
  
  if (sentenceMatch) {
    return sentenceMatch[1];
  }
  
  // Fall back to word boundary
  const words = endPart.split(' ');
  return words.slice(1).join(' '); // Skip first potentially partial word
}

/**
 * Split a very long sentence into smaller chunks by words
 */
function splitLongSentence(sentence: string, maxSize: number): string[] {
  const words = sentence.split(' ');
  const chunks: string[] = [];
  let currentChunk = '';

  for (const word of words) {
    if (currentChunk.length + word.length + 1 > maxSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = word;
      } else {
        // Single word is too long, just add it
        chunks.push(word);
      }
    } else {
      if (currentChunk) {
        currentChunk += ' ' + word;
      } else {
        currentChunk = word;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
