import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool, readUserKey } from "../../../lib/db";
import { DEFAULT_MODE, DietModeId, isDietModeId } from "../../../lib/modes";
import {
  PROFILE_COLUMNS,
  ProfileRow,
  isMember,
  serializeProfile,
} from "../../../lib/profile";
import {
  ACTIVITIES,
  Activity,
  CUISINES,
  DEFAULT_PROFILE,
  FASTING_WINDOWS,
  FastingWindow,
  MODE_RESTRICTION_CONFLICTS,
  RESTRICTIONS,
  Restriction,
  SEXES,
  Sex,
} from "../../../lib/types";

export const dynamic = "force-dynamic";

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

/** 비워둘 수 있는 숫자. 범위를 벗어나면 입력하지 않은 것으로 본다. */
function optionalNumber(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return Math.round(num * 10) / 10;
}

export async function GET(request: NextRequest) {
  const userKey = readUserKey(request);
  if (!userKey) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  try {
    await ensureSchema();
    const { rows } = await pool.query<ProfileRow>(
      `SELECT ${PROFILE_COLUMNS} FROM dinner_profiles WHERE user_key = $1`,
      [userKey]
    );
    return NextResponse.json(rows[0] ? serializeProfile(rows[0]) : DEFAULT_PROFILE);
  } catch (error) {
    console.error("GET /api/profile failed", error);
    return NextResponse.json({ error: "설정을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const userKey = readUserKey(request);
  if (!userKey) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  try {
    await ensureSchema();
    const body = await request.json();

    const mode: DietModeId = isDietModeId(body?.mode) ? body.mode : DEFAULT_MODE;

    const sex: Sex | null = isMember(SEXES, body?.sex) ? body.sex : null;
    const age = optionalNumber(body?.age, 14, 100);
    const heightCm = optionalNumber(body?.heightCm, 120, 230);
    const weightKg = optionalNumber(body?.weightKg, 30, 250);
    const targetWeightKg = optionalNumber(body?.targetWeightKg, 30, 250);
    const activity: Activity = isMember(ACTIVITIES, body?.activity) ? body.activity : "light";

    // 모드와 모순되는 제한은 저장 단계에서 떨어뜨린다.
    // 화면에서도 막지만, 저장된 데이터가 스스로 모순되게 두지 않는다.
    const conflicting = MODE_RESTRICTION_CONFLICTS[mode] ?? [];
    const restrictions: Restriction[] = Array.isArray(body?.restrictions)
      ? Array.from(
          new Set(
            body.restrictions.filter(
              (item: unknown): item is Restriction =>
                isMember(RESTRICTIONS, item) && !conflicting.includes(item)
            )
          )
        )
      : [];

    const allergies: string[] = Array.isArray(body?.allergies)
      ? Array.from(
          new Set(
            (body.allergies as unknown[])
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim().slice(0, 20))
              .filter(Boolean)
          )
        ).slice(0, 20)
      : [];

    const allowDairy = body?.allowDairy !== false;
    const fastingWindow: FastingWindow = isMember(FASTING_WINDOWS, body?.fastingWindow)
      ? body.fastingWindow
      : "none";

    const spice = clamp(body?.spice, 0, 4, DEFAULT_PROFILE.spice);
    const maxMinutes = clamp(body?.maxMinutes, 10, 120, DEFAULT_PROFILE.maxMinutes);
    const servings = clamp(body?.servings, 1, 8, DEFAULT_PROFILE.servings);
    const cuisines: string[] = Array.isArray(body?.cuisines)
      ? body.cuisines.filter((item: unknown) =>
          (CUISINES as readonly string[]).includes(item as string)
        )
      : [];
    const dislikes = typeof body?.dislikes === "string" ? body.dislikes.trim().slice(0, 200) : "";

    const { rows } = await pool.query<ProfileRow>(
      `INSERT INTO dinner_profiles
              (user_key, mode, sex, age, height_cm, weight_kg, target_weight_kg, activity,
               restrictions, allergies, allow_dairy, fasting_window,
               spice, max_minutes, servings, cuisines, dislikes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
       ON CONFLICT (user_key) DO UPDATE
              SET mode = EXCLUDED.mode,
                  sex = EXCLUDED.sex,
                  age = EXCLUDED.age,
                  height_cm = EXCLUDED.height_cm,
                  weight_kg = EXCLUDED.weight_kg,
                  target_weight_kg = EXCLUDED.target_weight_kg,
                  activity = EXCLUDED.activity,
                  restrictions = EXCLUDED.restrictions,
                  allergies = EXCLUDED.allergies,
                  allow_dairy = EXCLUDED.allow_dairy,
                  fasting_window = EXCLUDED.fasting_window,
                  spice = EXCLUDED.spice,
                  max_minutes = EXCLUDED.max_minutes,
                  servings = EXCLUDED.servings,
                  cuisines = EXCLUDED.cuisines,
                  dislikes = EXCLUDED.dislikes,
                  updated_at = NOW()
        RETURNING ${PROFILE_COLUMNS}`,
      [
        userKey,
        mode,
        sex,
        age,
        heightCm,
        weightKg,
        targetWeightKg,
        activity,
        restrictions,
        allergies,
        allowDairy,
        fastingWindow,
        spice,
        maxMinutes,
        servings,
        cuisines,
        dislikes,
      ]
    );
    return NextResponse.json(serializeProfile(rows[0]));
  } catch (error) {
    console.error("PUT /api/profile failed", error);
    return NextResponse.json({ error: "설정을 저장하지 못했습니다." }, { status: 500 });
  }
}
