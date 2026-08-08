import { NextRequest, NextResponse } from "next/server";
import { MissingApiKeyError, RECIPES_SCHEMA, askForJson } from "../../../lib/claude";
import { ensureSchema, pool, readUserKey } from "../../../lib/db";
import {
  DEFAULT_PROFILE,
  DIET_LABELS,
  Diet,
  Ingredient,
  Profile,
  Recipe,
  SPICE_LABELS,
} from "../../../lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `당신은 집에 있는 재료로 저녁 메뉴를 골라주는 요리 도우미입니다.

규칙:
- 사용자가 가진 재료를 최대한 활용하는 요리를 3개 추천하세요.
- 추천은 다양해야 합니다. 비슷한 요리 3개를 주지 마세요.
- 사용자의 취향(맵기, 조리 시간, 식단 제한, 선호 요리 종류, 싫어하는 것)을 반드시 지키세요.
  특히 식단 제한과 싫어하는 재료는 절대 어기면 안 됩니다.
- 최소 1개는 추가 구매 없이 가진 재료만으로 만들 수 있어야 합니다(missingIngredients가 빈 배열).
- 소금, 후추, 식용유, 물처럼 어느 집에나 있는 기본 양념은 missingIngredients에 넣지 마세요.
- steps는 실제로 따라 할 수 있게 구체적으로 쓰되, 한 단계는 한 문장으로 간결하게 쓰세요.
- reason에는 이 사용자의 취향 중 무엇에 맞췄는지 구체적으로 적으세요.
- minutes는 사용자가 정한 최대 조리 시간을 넘지 않게 하세요.`;

function describeProfile(profile: Profile): string {
  const lines = [
    `- 인원: ${profile.servings}인분`,
    `- 맵기 선호: ${SPICE_LABELS[profile.spice] ?? "보통"}`,
    `- 최대 조리 시간: ${profile.maxMinutes}분`,
    `- 식단 제한: ${DIET_LABELS[profile.diet]}`,
    `- 선호 요리 종류: ${profile.cuisines.length ? profile.cuisines.join(", ") : "특별한 선호 없음"}`,
    `- 싫어하는 재료/음식: ${profile.dislikes || "없음"}`,
  ];
  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  const userKey = readUserKey(request);
  if (!userKey) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  try {
    const body = await request.json();
    const ingredients: Ingredient[] = Array.isArray(body?.ingredients) ? body.ingredients : [];
    const names = ingredients
      .map((item) => (typeof item?.name === "string" ? item.name.trim() : ""))
      .filter(Boolean)
      .slice(0, 60);

    if (!names.length) {
      return NextResponse.json({ error: "재료가 최소 1개는 있어야 합니다." }, { status: 400 });
    }

    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT spice, max_minutes, servings, diet, cuisines, dislikes
         FROM dinner_profiles WHERE user_key = $1`,
      [userKey]
    );
    const profile: Profile = rows[0]
      ? {
          spice: rows[0].spice,
          maxMinutes: rows[0].max_minutes,
          servings: rows[0].servings,
          diet: rows[0].diet as Diet,
          cuisines: rows[0].cuisines ?? [],
          dislikes: rows[0].dislikes ?? "",
        }
      : DEFAULT_PROFILE;

    const prompt = `가진 재료:\n${names.map((name) => `- ${name}`).join("\n")}\n\n사용자 취향:\n${describeProfile(profile)}\n\n오늘 저녁 메뉴 3개를 추천해주세요.`;

    const result = await askForJson<{ recipes: Recipe[] }>({
      system: SYSTEM,
      content: [{ type: "text", text: prompt }],
      schema: RECIPES_SCHEMA as unknown as Record<string, unknown>,
      effort: "medium",
      maxTokens: 16000,
    });

    const { rows: saved } = await pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO dinner_sessions (user_key, ingredients, recipes)
            VALUES ($1, $2, $3)
         RETURNING id, created_at`,
      [userKey, JSON.stringify(ingredients), JSON.stringify(result.recipes)]
    );

    return NextResponse.json({
      id: Number(saved[0].id),
      createdAt: saved[0].created_at.toISOString(),
      recipes: result.recipes,
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다." },
        { status: 503 }
      );
    }
    console.error("POST /api/recommend failed", error);
    const message = error instanceof Error ? error.message : "추천을 만들지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
