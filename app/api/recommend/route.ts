import { NextRequest, NextResponse } from "next/server";
import { ThinkingLevel } from "@google/genai";
import { MissingApiKeyError, RECIPES_SCHEMA, askForJson } from "../../../lib/gemini";
import { ensureSchema, pool, readUserKey } from "../../../lib/db";
import { loadProfile } from "../../../lib/profile";
import { DietMode, METRIC_LABELS, getMode } from "../../../lib/modes";
import { Targets, computeTargets } from "../../../lib/nutrition";
import { findPhoto } from "../../../lib/recipe-photos";
import { filterRecipes, restrictionPromptLines } from "../../../lib/rules";
import {
  ACTIVITY_LABELS,
  DroppedRecipe,
  FASTING_LABELS,
  Ingredient,
  Profile,
  Recipe,
  SPICE_LABELS,
} from "../../../lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_SYSTEM = `당신은 다이어트 중인 사람의 냉장고 사진을 보고 오늘 먹을 요리를 골라주는 도우미입니다.

기본 규칙:
- 사용자가 가진 재료를 최대한 활용하는 요리를 3개 추천하세요.
- 추천은 서로 달라야 합니다. 비슷한 요리 3개를 주지 마세요.
- 최소 1개는 추가 구매 없이 가진 재료만으로 만들 수 있어야 합니다(missingIngredients가 빈 배열).
- 소금, 후추, 식용유, 물처럼 어느 집에나 있는 기본 양념은 missingIngredients에 넣지 마세요.
- steps는 실제로 따라 할 수 있게 쓰되, 한 단계는 한 문장으로 간결하게 쓰세요.
- minutes는 사용자가 정한 최대 조리 시간을 넘지 않게 하세요.

영양 계산 규칙:
- nutrition은 반드시 1인분 기준으로 계산하세요. 전체 양이 아닙니다.
- carb는 식이섬유를 포함한 총 탄수화물이고, netCarb은 carb에서 fiber를 뺀 값입니다.
- 값을 모르면 비슷한 요리의 일반적인 값으로 추정하되, 0으로 두지 마세요.
- modeFit은 이 요리가 사용자의 다이어트 모드에 얼마나 맞는지를 0~100으로 매긴 점수입니다.
  세 요리에 같은 점수를 주지 말고 차이를 두세요.
- modeReason에는 그 점수의 근거를 숫자와 함께 한 문장으로 쓰세요.
- swaps에는 이 모드에 더 맞게 만드는 재료 교체를 1~3개 제안하고, effect에 변화량을 숫자로 쓰세요.
- commonName에는 이 요리와 가장 가까운 표준 요리 이름을 쓰세요. 요리 사진을 찾는 데 씁니다.
  name이 창작한 이름이라면 commonName은 반드시 누구나 아는 이름이어야 합니다.
  예: name "매콤 마늘 닭가슴살 브로콜리 볶음" → commonName "닭가슴살볶음".

우선순위: 알러지 > 식단 제한 > 다이어트 모드의 하드룰 > 목표 열량과 단백질 > 맛과 취향.
앞의 것을 지키기 위해 뒤의 것은 포기해도 됩니다.`;

function describeMode(mode: DietMode, targets: Targets | null): string {
  const lines = [
    `[다이어트 모드] ${mode.label} — ${mode.tagline}`,
    `- 매크로 비율: 탄수 ${mode.macro.carb}% / 단백질 ${mode.macro.protein}% / 지방 ${mode.macro.fat}%`,
    `- 결과 카드에서 강조할 지표: ${METRIC_LABELS[mode.primaryMetric]}`,
  ];

  if (targets) {
    lines.push(
      `- 하루 목표: ${targets.dailyKcal}kcal, 단백질 ${targets.dailyProtein}g (하루 ${targets.mealsPerDay}끼 기준)`,
      `- 이번 끼니 목표: ${targets.mealKcal}kcal 이하, 단백질 ${targets.mealProtein}g 이상`
    );
  } else {
    lines.push(
      "- 사용자가 신체 정보를 입력하지 않아 목표 열량이 없습니다. 일반적인 1인분 기준으로 만들고 영양값은 그대로 추정하세요."
    );
  }

  lines.push("", "반드시 지킬 것:");
  for (const rule of mode.hardRules) lines.push(`- ${rule}`);
  lines.push("", "가능하면 지킬 것:");
  for (const rule of mode.softRules) lines.push(`- ${rule}`);

  return lines.join("\n");
}

function describeProfile(profile: Profile): string {
  const lines = [`- 인원: ${profile.servings}인분`, `- 최대 조리 시간: ${profile.maxMinutes}분`];

  const safety = restrictionPromptLines(profile);
  if (safety.length) lines.push(...safety);

  if (profile.mode === "carnivore" && !profile.allowDairy) {
    lines.push("- 유제품도 빼기로 했습니다. 우유·치즈·버터·크림을 쓰지 마세요.");
  }
  if (profile.fastingWindow !== "none") {
    lines.push(
      `- 간헐적 단식: ${FASTING_LABELS[profile.fastingWindow]}. 끼니 수가 적으니 한 끼의 밀도를 높이세요.`
    );
  }
  lines.push(
    `- 활동량: ${ACTIVITY_LABELS[profile.activity]}`,
    `- 맵기 선호: ${SPICE_LABELS[profile.spice] ?? "보통"}`,
    `- 선호 요리 종류: ${profile.cuisines.length ? profile.cuisines.join(", ") : "특별한 선호 없음"}`,
    `- 싫어하는 재료/음식: ${profile.dislikes || "없음"}`
  );

  return lines.join("\n");
}

function buildPrompt(names: string[], profile: Profile, retryOf: DroppedRecipe[]): string {
  const sections = [
    `가진 재료:\n${names.map((name) => `- ${name}`).join("\n")}`,
    `사용자 정보:\n${describeProfile(profile)}`,
  ];

  if (retryOf.length) {
    sections.push(
      "직전 답변에서 아래 요리는 규칙을 어겨서 버려졌습니다. 같은 실수를 반복하지 말고 다시 만들어주세요:\n" +
        retryOf.map((item) => `- ${item.name}: ${item.reason}`).join("\n")
    );
  }

  sections.push("위 조건을 지키는 요리 3개를 추천해주세요.");
  return sections.join("\n\n");
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
    const profile = await loadProfile(userKey);
    const mode = getMode(profile.mode);
    const targets = computeTargets(profile);
    const system = `${BASE_SYSTEM}\n\n${describeMode(mode, targets)}`;

    /*
     * 모델이 하드룰을 어기면 코드가 걸러낸다(lib/rules.ts).
     * 세 개가 다 걸러지는 일도 있으므로 무엇이 왜 버려졌는지 알려주고 한 번만 다시 요청한다.
     * 재요청은 한 번으로 제한한다 — 계속 실패하는 조건이면 사용자에게 말하는 게 낫다.
     */
    let kept: Recipe[] = [];
    let dropped: DroppedRecipe[] = [];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await askForJson<{ recipes: Recipe[] }>({
        system,
        parts: [{ text: buildPrompt(names, profile, attempt === 0 ? [] : dropped) }],
        schema: RECIPES_SCHEMA,
        thinking: ThinkingLevel.HIGH,
        maxOutputTokens: 24000,
      });

      const filtered = filterRecipes(result.recipes ?? [], profile, targets);
      kept = filtered.kept;
      dropped = filtered.dropped;

      if (kept.length >= 2 || dropped.length === 0) break;
    }

    if (!kept.length) {
      return NextResponse.json(
        {
          error:
            `${mode.label} 모드 조건에 맞는 요리를 만들지 못했습니다. ` +
            `재료를 더 추가하거나 모드를 바꿔보세요.`,
          dropped,
        },
        { status: 422 }
      );
    }

    // 적합도가 높은 순으로 보여준다. 모델이 매긴 순서를 그대로 믿지 않는다.
    kept.sort((a, b) => b.modeFit - a.modeFit);

    // 공공 DB에 같은 요리가 있으면 실사 사진을 붙인다. 확실할 때만 붙으므로
    // 대부분의 레시피에는 photo가 없고, 카드는 사진 없이 그려진다.
    const withPhotos = kept.map((recipe) => ({
      ...recipe,
      photo: findPhoto(recipe.name, recipe.commonName),
    }));

    const { rows: saved } = await pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO dinner_sessions (user_key, ingredients, recipes, mode)
            VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
      [userKey, JSON.stringify(ingredients), JSON.stringify(withPhotos), profile.mode]
    );

    return NextResponse.json({
      id: Number(saved[0].id),
      createdAt: saved[0].created_at.toISOString(),
      mode: profile.mode,
      recipes: withPhotos,
      dropped,
      targets,
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: "서버에 GOOGLE_API_KEY가 설정되지 않았습니다." },
        { status: 503 }
      );
    }
    console.error("POST /api/recommend failed", error);
    const message = error instanceof Error ? error.message : "추천을 만들지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
