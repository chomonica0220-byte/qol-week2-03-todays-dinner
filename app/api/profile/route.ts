import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool, readUserKey } from "../../../lib/db";
import { CUISINES, DEFAULT_PROFILE, DIETS, Diet, Profile } from "../../../lib/types";

export const dynamic = "force-dynamic";

type ProfileRow = {
  spice: number;
  max_minutes: number;
  servings: number;
  diet: string;
  cuisines: string[];
  dislikes: string;
};

function serialize(row: ProfileRow): Profile {
  return {
    spice: row.spice,
    maxMinutes: row.max_minutes,
    servings: row.servings,
    diet: (DIETS as readonly string[]).includes(row.diet) ? (row.diet as Diet) : "none",
    cuisines: row.cuisines ?? [],
    dislikes: row.dislikes ?? "",
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export async function GET(request: NextRequest) {
  const userKey = readUserKey(request);
  if (!userKey) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  try {
    await ensureSchema();
    const { rows } = await pool.query<ProfileRow>(
      `SELECT spice, max_minutes, servings, diet, cuisines, dislikes
         FROM dinner_profiles WHERE user_key = $1`,
      [userKey]
    );
    return NextResponse.json(rows[0] ? serialize(rows[0]) : DEFAULT_PROFILE);
  } catch (error) {
    console.error("GET /api/profile failed", error);
    return NextResponse.json({ error: "취향을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const userKey = readUserKey(request);
  if (!userKey) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  try {
    await ensureSchema();
    const body = await request.json();

    const spice = clamp(body?.spice, 0, 4, DEFAULT_PROFILE.spice);
    const maxMinutes = clamp(body?.maxMinutes, 10, 120, DEFAULT_PROFILE.maxMinutes);
    const servings = clamp(body?.servings, 1, 8, DEFAULT_PROFILE.servings);
    const diet: Diet = (DIETS as readonly string[]).includes(body?.diet) ? body.diet : "none";
    const cuisines: string[] = Array.isArray(body?.cuisines)
      ? body.cuisines.filter((item: unknown) => (CUISINES as readonly string[]).includes(item as string))
      : [];
    const dislikes = typeof body?.dislikes === "string" ? body.dislikes.trim().slice(0, 200) : "";

    const { rows } = await pool.query<ProfileRow>(
      `INSERT INTO dinner_profiles (user_key, spice, max_minutes, servings, diet, cuisines, dislikes, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_key) DO UPDATE
            SET spice = EXCLUDED.spice,
                max_minutes = EXCLUDED.max_minutes,
                servings = EXCLUDED.servings,
                diet = EXCLUDED.diet,
                cuisines = EXCLUDED.cuisines,
                dislikes = EXCLUDED.dislikes,
                updated_at = NOW()
         RETURNING spice, max_minutes, servings, diet, cuisines, dislikes`,
      [userKey, spice, maxMinutes, servings, diet, cuisines, dislikes]
    );
    return NextResponse.json(serialize(rows[0]));
  } catch (error) {
    console.error("PUT /api/profile failed", error);
    return NextResponse.json({ error: "취향을 저장하지 못했습니다." }, { status: 500 });
  }
}
