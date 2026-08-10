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

      /* ---------- 다이어터 버전에서 늘어난 컬럼 ----------
       *
       * 이미 배포된 테이블 위에 얹어야 하므로 ADD COLUMN IF NOT EXISTS로 붙인다.
       * 실수 단위 값은 NUMERIC이 아니라 REAL로 둔다. NUMERIC은 pg 드라이버가
       * 문자열로 돌려줘서 받는 쪽에서 매번 Number() 처리를 해야 한다.
       */
      await pool.query(`
        ALTER TABLE dinner_profiles
          ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'mediterranean',
          ADD COLUMN IF NOT EXISTS sex TEXT,
          ADD COLUMN IF NOT EXISTS age INTEGER,
          ADD COLUMN IF NOT EXISTS height_cm INTEGER,
          ADD COLUMN IF NOT EXISTS weight_kg REAL,
          ADD COLUMN IF NOT EXISTS target_weight_kg REAL,
          ADD COLUMN IF NOT EXISTS activity TEXT NOT NULL DEFAULT 'light',
          ADD COLUMN IF NOT EXISTS restrictions TEXT[] NOT NULL DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS allergies TEXT[] NOT NULL DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS allow_dairy BOOLEAN NOT NULL DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS fasting_window TEXT NOT NULL DEFAULT 'none'
      `);
      await pool.query(
        `ALTER TABLE dinner_sessions ADD COLUMN IF NOT EXISTS mode TEXT`
      );

      /* 완성 사진 캐시.
       *
       * 요리 이름은 사용자를 가로질러 반복되므로 이름 기준으로 한 번만 만들고 재사용한다.
       * 바이트를 그대로 들고 있는 이유는 별도 스토리지 자격증명 없이 도는 게 우선이라서다.
       * 커지면 Supabase Storage나 Blob으로 옮기고 url 컬럼만 바꾸면 된다. */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS recipe_images (
          slug TEXT PRIMARY KEY,
          mime TEXT NOT NULL,
          data TEXT NOT NULL,
          bytes INTEGER NOT NULL,
          origin TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      /* 구버전의 단일 diet 필드를 목표(mode)와 제한(restrictions) 두 축으로 옮긴다.
       * restrictions가 비어 있는 행에만 적용되므로 여러 번 실행해도 안전하다. */
      await pool.query(`
        UPDATE dinner_profiles
           SET restrictions = ARRAY[diet]
         WHERE cardinality(restrictions) = 0
           AND diet IN ('vegetarian', 'vegan', 'halal')
      `);
      await pool.query(`
        UPDATE dinner_profiles
           SET mode = 'keto'
         WHERE diet = 'lowcarb' AND mode = 'mediterranean'
      `);
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
