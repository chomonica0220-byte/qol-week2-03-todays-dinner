import { Part, ThinkingLevel } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { INGREDIENTS_SCHEMA, MissingApiKeyError, askForJson } from "../../../lib/gemini";
import { Ingredient } from "../../../lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** base64 4자 = 원본 3바이트. 약 4MB 원본까지 허용. */
const MAX_BASE64_LENGTH = 5_600_000;

const SYSTEM = `당신은 냉장고 사진을 보고 식재료를 목록화하는 도우미입니다.

규칙:
- 사진에서 실제로 보이는 것만 적으세요. 있을 법한 재료를 추측해서 넣지 마세요.
- 포장지에 가려 정확히 알 수 없으면 confidence를 low로 두고, note에 근거를 적으세요.
- 재료 이름은 요리에 쓰는 일반적인 한국어 명칭으로 적으세요 (예: "계란", "대파", "두부").
- 같은 재료가 여러 개 보이면 하나의 항목으로 합치고 수량은 note에 적으세요.
- 조미료와 소스도 보이면 포함하세요.
- 사진에 음식 재료가 전혀 없으면 ingredients를 빈 배열로 두고 comment로 설명하세요.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mediaType = body?.mediaType;
    const imageBase64 = body?.imageBase64;

    if (!ALLOWED_MEDIA_TYPES.includes(mediaType)) {
      return NextResponse.json({ error: "JPEG, PNG, WebP 이미지만 지원합니다." }, { status: 400 });
    }
    if (typeof imageBase64 !== "string" || !imageBase64) {
      return NextResponse.json({ error: "이미지가 필요합니다." }, { status: 400 });
    }
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        { error: "이미지가 너무 큽니다. 더 작은 사진으로 시도해주세요." },
        { status: 413 }
      );
    }

    const parts: Part[] = [
      { inlineData: { mimeType: mediaType, data: imageBase64 } },
      { text: "이 냉장고 사진에서 요리에 쓸 수 있는 식재료를 모두 찾아주세요." },
    ];

    const result = await askForJson<{ ingredients: Ingredient[]; comment: string }>({
      system: SYSTEM,
      parts,
      schema: INGREDIENTS_SCHEMA,
      thinking: ThinkingLevel.LOW,
      maxOutputTokens: 8000,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: "서버에 GOOGLE_API_KEY가 설정되지 않았습니다." },
        { status: 503 }
      );
    }
    console.error("POST /api/analyze failed", error);
    const message = error instanceof Error ? error.message : "사진을 분석하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
