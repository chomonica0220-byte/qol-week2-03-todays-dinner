import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var dinnerPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var dinnerSchemaReady: Promise<void> | undefined;
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

export const pool =
  globalThis.dinnerPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") globalThis.dinnerPool = pool;

/**
 * 테이블 생성은 프로세스당 한 번만 수행한다.
 * 실패하면 캐시를 비워서 다음 요청이 다시 시도할 수 있게 한다.
 */
export function ensureSchema(): Promise<void> {
  if (!globalThis.dinnerSchemaReady) {
    globalThis.dinnerSchemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS dinner_profiles (
          user_key TEXT PRIMARY KEY,
          spice INTEGER NOT NULL DEFAULT 2,
          max_minutes INTEGER NOT NULL DEFAULT 30,
          servings INTEGER NOT NULL DEFAULT 2,
          diet TEXT NOT NULL DEFAULT 'none',
          cuisines TEXT[] NOT NULL DEFAULT '{}',
          dislikes TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS dinner_sessions (
          id BIGSERIAL PRIMARY KEY,
          user_key TEXT NOT NULL,
          ingredients JSONB NOT NULL,
          recipes JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS dinner_sessions_user_created_idx
           ON dinner_sessions (user_key, created_at DESC)`
      );
    })().catch((error) => {
      globalThis.dinnerSchemaReady = undefined;
      throw error;
    });
  }
  return globalThis.dinnerSchemaReady;
}

/** 브라우저가 보내는 사용자 키를 검증한다. 로그인 대신 쓰는 임의 식별자. */
export function readUserKey(request: Request): string | null {
  const key = new URL(request.url).searchParams.get("user") ?? "";
  return /^[A-Za-z0-9_-]{8,64}$/.test(key) ? key : null;
}
