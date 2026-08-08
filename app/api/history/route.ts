import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool, readUserKey } from "../../../lib/db";
import { DinnerSession, Ingredient, Recipe } from "../../../lib/types";

export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  ingredients: Ingredient[];
  recipes: Recipe[];
  created_at: Date;
};

export async function GET(request: NextRequest) {
  const userKey = readUserKey(request);
  if (!userKey) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  try {
    await ensureSchema();
    const { rows } = await pool.query<SessionRow>(
      `SELECT id, ingredients, recipes, created_at
         FROM dinner_sessions
        WHERE user_key = $1
        ORDER BY created_at DESC
        LIMIT 10`,
      [userKey]
    );

    const sessions: DinnerSession[] = rows.map((row) => ({
      id: Number(row.id),
      ingredients: row.ingredients,
      recipes: row.recipes,
      createdAt: row.created_at.toISOString(),
    }));
    return NextResponse.json(sessions);
  } catch (error) {
    console.error("GET /api/history failed", error);
    return NextResponse.json({ error: "기록을 불러오지 못했습니다." }, { status: 500 });
  }
}
