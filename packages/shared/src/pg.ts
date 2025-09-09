import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/**
 * Initialize PostgreSQL connection pool
 */
export function initializePool(): pg.Pool {
  if (pool) {
    return pool;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });

  console.log('✅ Database pool initialized');
  return pool;
}

/**
 * Execute a query with parameters
 */
export async function query<T extends pg.QueryResultRow = any>(
  text: string, 
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const client = pool || initializePool();
  
  try {
    const start = Date.now();
    const res = await client.query<T>(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      console.warn(`Slow query (${duration}ms): ${text}`);
    }
    
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    console.error('Query:', text);
    console.error('Params:', params);
    throw error;
  }
}

/**
 * Gracefully close the database connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ Database pool closed');
  }
}

// Handle graceful shutdown
process.on('SIGINT', closePool);
process.on('SIGTERM', closePool);
