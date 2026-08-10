import { pool } from "./db";
import { MissingApiKeyError, genAI } from "./gemini";

/**
 * 완성 사진 캐시.
 *
 * 요리 이름은 사용자를 가로질러 반복된다("두부 스테이크"는 누가 요청하든 같은 그림이면 된다).
 * 그래서 이름을 정규화한 slug 하나로 캐시하고, 없을 때만 만든다.
 * 처음 한 번만 비용이 들고 그 뒤로는 DB 조회다.
 *
 * 지금은 생성만 한다. 나중에 공공 레시피 DB 매칭을 앞에 붙이면 origin이 'db'인 행이 생기고,
 * 조회하는 쪽은 바뀌지 않는다.
 */

/** 이미지 모델은 바뀔 수 있어서 환경 변수로 뺀다. 없으면 가장 싼 것을 쓴다. */
export const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-3.1-flash-lite-image";

/** 이 크기를 넘으면 캐시에 넣지 않는다. DB가 이미지 창고가 되면 안 된다. */
const MAX_CACHE_BYTES = 4 * 1024 * 1024;

export type CachedImage = {
  mime: string;
  /** base64 */
  data: string;
  origin: "generated" | "db";
};

/**
 * 요리 이름 → 캐시 키.
 * 공백과 문장부호를 털어내 "두부 스테이크"와 "두부스테이크"가 같은 그림을 쓰게 한다.
 */
export function toSlug(name: string): string {
  return name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s.,!?~"'`()[\]{}<>/\\|:;+*^%$#@=_-]/g, "")
    .slice(0, 100);
}

async function readCache(slug: string): Promise<CachedImage | null> {
  const { rows } = await pool.query<{ mime: string; data: string; origin: string }>(
    `SELECT mime, data, origin FROM recipe_images WHERE slug = $1`,
    [slug]
  );
  if (!rows[0]) return null;
  return {
    mime: rows[0].mime,
    data: rows[0].data,
    origin: rows[0].origin === "db" ? "db" : "generated",
  };
}

function buildPrompt(name: string): string {
  return [
    `"${name}" 요리의 완성된 접시 사진.`,
    "흰 그릇에 1인분으로 담겨 있고, 자연광에 위에서 45도 각도로 찍은 사실적인 음식 사진.",
    "배경은 단순한 나무 식탁. 사람, 손, 글자, 로고, 워터마크는 넣지 마세요.",
  ].join(" ");
}

/** 응답 파트에서 첫 이미지를 꺼낸다. 모델이 설명 텍스트를 같이 주기도 한다. */
function extractImage(parts: unknown): { mime: string; data: string } | null {
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const inline = (part as { inlineData?: { mimeType?: string; data?: string } })?.inlineData;
    if (inline?.data) return { mime: inline.mimeType || "image/png", data: inline.data };
  }
  return null;
}

/** 결제가 꺼져 있으면 이미지 모델의 무료 등급 한도가 0이라 매번 429가 돌아온다. */
export class ImageQuotaError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "ImageQuotaError";
  }
}

declare global {
  // eslint-disable-next-line no-var
  var dinnerImageBlockedUntil: number | undefined;
}

/** 한도가 0이면 다시 불러도 결과가 같다. 잠깐 쉬었다가 다시 본다. */
const QUOTA_COOLDOWN_MS = 10 * 60 * 1000;

function isQuotaError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes('"code":429') || text.includes("RESOURCE_EXHAUSTED");
}

async function generate(name: string): Promise<CachedImage | null> {
  const blockedUntil = globalThis.dinnerImageBlockedUntil ?? 0;
  if (Date.now() < blockedUntil) {
    throw new ImageQuotaError("이미지 생성 할당량이 없어 잠시 중단된 상태입니다.");
  }

  const response = await genAI().models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: "user", parts: [{ text: buildPrompt(name) }] }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "4:3", imageSize: "1K" },
    },
  });

  const image = extractImage(response.candidates?.[0]?.content?.parts);
  if (!image) return null;
  return { ...image, origin: "generated" };
}

/**
 * 캐시에 있으면 그걸 주고, 없으면 만들어서 넣는다.
 *
 * 같은 요리를 동시에 여러 명이 열면 생성이 중복될 수 있다. 막지 않고
 * ON CONFLICT DO NOTHING으로 먼저 넣은 쪽을 살린다 — 잠금을 걸어 기다리게 하는 것보다
 * 한 번 더 만드는 편이 낫다.
 */
export async function getOrCreateImage(name: string): Promise<CachedImage | null> {
  const slug = toSlug(name);
  if (!slug) return null;

  const cached = await readCache(slug);
  if (cached) return cached;

  let made: CachedImage | null;
  try {
    made = await generate(name);
  } catch (error) {
    // 한도 초과는 계속 두드려도 달라지지 않는다. 카드마다 요청이 나가므로
    // 한 번 막히면 잠시 멈춰서 실패한 호출을 반복하지 않는다.
    if (isQuotaError(error)) {
      globalThis.dinnerImageBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
      throw new ImageQuotaError(error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
  if (!made) return null;

  const bytes = Buffer.byteLength(made.data, "base64");
  if (bytes <= MAX_CACHE_BYTES) {
    await pool.query(
      `INSERT INTO recipe_images (slug, mime, data, bytes, origin)
            VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO NOTHING`,
      [slug, made.mime, made.data, bytes, made.origin]
    );
  } else {
    console.warn(`recipe image too large to cache: ${slug} (${bytes} bytes)`);
  }

  return made;
}

export { MissingApiKeyError };
