import { pool } from "./db";
import { DEFAULT_MODE, DietModeId, isDietModeId } from "./modes";
import {
  ACTIVITIES,
  DEFAULT_PROFILE,
  FASTING_WINDOWS,
  Profile,
  RESTRICTIONS,
  Restriction,
  SEXES,
} from "./types";

/**
 * 프로필 행을 읽는 쪽은 두 곳(설정 API, 추천 API)이라 매핑을 여기 모아둔다.
 * 라우트 파일에 두면 Next.js가 허용하는 export가 정해져 있어 공유할 수 없다.
 */

export const PROFILE_COLUMNS = `mode, sex, age, height_cm, weight_kg, target_weight_kg, activity,
                                restrictions, allergies, allow_dairy, fasting_window,
                                spice, max_minutes, servings, cuisines, dislikes`;

export type ProfileRow = {
  mode: string;
  sex: string | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  target_weight_kg: number | null;
  activity: string;
  restrictions: string[];
  allergies: string[];
  allow_dairy: boolean;
  fasting_window: string;
  spice: number;
  max_minutes: number;
  servings: number;
  cuisines: string[];
  dislikes: string;
};

export function isMember<T extends string>(
  list: readonly T[],
  value: unknown
): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

export function serializeProfile(row: ProfileRow): Profile {
  const mode: DietModeId = isDietModeId(row.mode) ? row.mode : DEFAULT_MODE;
  return {
    mode,
    sex: isMember(SEXES, row.sex) ? row.sex : null,
    age: row.age ?? null,
    heightCm: row.height_cm ?? null,
    weightKg: row.weight_kg ?? null,
    targetWeightKg: row.target_weight_kg ?? null,
    activity: isMember(ACTIVITIES, row.activity) ? row.activity : "light",
    restrictions: (row.restrictions ?? []).filter((item): item is Restriction =>
      isMember(RESTRICTIONS, item)
    ),
    allergies: row.allergies ?? [],
    allowDairy: row.allow_dairy ?? true,
    fastingWindow: isMember(FASTING_WINDOWS, row.fasting_window)
      ? row.fasting_window
      : "none",
    spice: row.spice,
    maxMinutes: row.max_minutes,
    servings: row.servings,
    cuisines: row.cuisines ?? [],
    dislikes: row.dislikes ?? "",
  };
}

/** 저장된 적이 없는 사용자는 기본 프로필로 시작한다. */
export async function loadProfile(userKey: string): Promise<Profile> {
  const { rows } = await pool.query<ProfileRow>(
    `SELECT ${PROFILE_COLUMNS} FROM dinner_profiles WHERE user_key = $1`,
    [userKey]
  );
  return rows[0] ? serializeProfile(rows[0]) : DEFAULT_PROFILE;
}
