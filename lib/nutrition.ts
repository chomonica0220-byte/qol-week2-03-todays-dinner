import { getMode } from "./modes";
import { ACTIVITY_FACTORS, FastingWindow, Profile } from "./types";

/**
 * 목표 열량과 매크로 계산.
 *
 * 신체 정보가 비어 있으면 null을 돌려준다. 이 경우 추천은 열량 목표 없이
 * "일반적인 1인분" 기준으로 돌아가야 한다. 억지로 기본값을 넣어 계산하면
 * 사용자에게 근거 없는 숫자를 보여주게 된다.
 */

/** 성인 기준 하루 최소 열량. 이 아래로는 목표를 내리지 않는다. */
export const KCAL_FLOOR = 1200;

/** 단식 창에 따른 하루 끼니 수. 목표 열량을 몇 등분할지 정한다. */
const MEALS_PER_DAY: Record<FastingWindow, number> = {
  none: 3,
  "16:8": 2,
  "18:6": 2,
  omad: 1,
};

export type Targets = {
  /** 유지 열량 */
  tdee: number;
  dailyKcal: number;
  mealKcal: number;
  dailyProtein: number;
  mealProtein: number;
  mealsPerDay: number;
  /** 하루 매크로 그램 */
  macroGrams: { carb: number; protein: number; fat: number };
  /** 계산값이 최소 열량에 걸려 올라갔는지 */
  floored: boolean;
};

function hasBodyInfo(profile: Profile): boolean {
  return (
    profile.sex !== null &&
    !!profile.age &&
    !!profile.heightCm &&
    !!profile.weightKg
  );
}

/** Mifflin-St Jeor 기초대사량 × 활동 계수. */
export function computeTdee(profile: Profile): number | null {
  if (!hasBodyInfo(profile)) return null;

  const weight = profile.weightKg as number;
  const height = profile.heightCm as number;
  const age = profile.age as number;

  const bmr =
    10 * weight + 6.25 * height - 5 * age + (profile.sex === "male" ? 5 : -161);

  return Math.round(bmr * ACTIVITY_FACTORS[profile.activity]);
}

export function computeTargets(profile: Profile): Targets | null {
  const tdee = computeTdee(profile);
  if (tdee === null) return null;

  const mode = getMode(profile.mode);
  const raw = Math.round(tdee * mode.kcalFactor);
  const dailyKcal = Math.max(KCAL_FLOOR, raw);
  const mealsPerDay = MEALS_PER_DAY[profile.fastingWindow];

  // 단백질은 체중 기준이 우선이다. 열량 비율에서 역산하면 감량 중에 단백질이 같이 깎인다.
  const weight = profile.weightKg as number;
  const dailyProtein = mode.proteinPerKg
    ? Math.round(weight * mode.proteinPerKg)
    : Math.round((dailyKcal * mode.macro.protein) / 100 / 4);

  const carbGrams = Math.round((dailyKcal * mode.macro.carb) / 100 / 4);
  // 단백질을 체중 기준으로 먼저 확정했으므로 남은 열량을 지방에 준다.
  const fatGrams = Math.max(
    0,
    Math.round((dailyKcal - carbGrams * 4 - dailyProtein * 4) / 9)
  );

  return {
    tdee,
    dailyKcal,
    mealKcal: Math.round(dailyKcal / mealsPerDay),
    dailyProtein,
    mealProtein: Math.round(dailyProtein / mealsPerDay),
    mealsPerDay,
    macroGrams: { carb: carbGrams, protein: dailyProtein, fat: fatGrams },
    floored: raw < KCAL_FLOOR,
  };
}

/** BMI 18.5에 해당하는 체중. 목표 체중의 하한으로 쓴다. */
export function minHealthyWeight(heightCm: number | null): number | null {
  if (!heightCm) return null;
  const meters = heightCm / 100;
  return Math.round(18.5 * meters * meters * 10) / 10;
}

/**
 * 목표 체중이 위험한 범위인지 본다.
 * 막지는 않고 경고만 띄운다 — 저체중에서 시작하는 사람도 있고,
 * 앱이 사용자의 몸을 판정할 위치에 있지도 않다.
 */
export function targetWeightWarning(profile: Profile): string | null {
  const floor = minHealthyWeight(profile.heightCm);
  if (floor === null || !profile.targetWeightKg) return null;
  if (profile.targetWeightKg >= floor) return null;
  return `목표 체중이 저체중 범위(${floor}kg 미만)입니다. 목표를 다시 확인해보세요.`;
}
