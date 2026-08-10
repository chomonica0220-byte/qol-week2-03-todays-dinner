import { DEFAULT_MODE, DietModeId } from "./modes";

/* ---------- 프로필: 다섯 축 ----------
 *
 * 목표(mode) · 제한(restrictions) · 안전(allergies) · 스케줄(fastingWindow) · 취향
 * 을 섞지 않는다. 비건은 목표가 아니라 제약이고, 단식은 무엇이 아니라 언제의 문제라서
 * 한 필드에 뭉치면 "비건 × 근육증량" 같은 정상적인 조합을 표현할 수 없다.
 */

export const RESTRICTIONS = [
  "vegetarian",
  "vegan",
  "halal",
  "lactosefree",
  "glutenfree",
] as const;
export type Restriction = (typeof RESTRICTIONS)[number];

export const RESTRICTION_LABELS: Record<Restriction, string> = {
  vegetarian: "베지테리언",
  vegan: "비건",
  halal: "할랄",
  lactosefree: "유당 못 먹음",
  glutenfree: "글루텐프리",
};

/** 모드와 모순되는 제한. 온보딩에서 함께 켜지 못하게 막는다. */
export const MODE_RESTRICTION_CONFLICTS: Partial<Record<DietModeId, Restriction[]>> = {
  carnivore: ["vegetarian", "vegan"],
  keto: ["vegan"],
};

export const SEXES = ["male", "female"] as const;
export type Sex = (typeof SEXES)[number];
export const SEX_LABELS: Record<Sex, string> = { male: "남성", female: "여성" };

export const ACTIVITIES = ["sedentary", "light", "moderate", "active"] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const ACTIVITY_LABELS: Record<Activity, string> = {
  sedentary: "거의 안 움직임",
  light: "주 1~2회 운동",
  moderate: "주 3~4회 운동",
  active: "주 5회 이상",
};

/** Mifflin-St Jeor 활동 계수. */
export const ACTIVITY_FACTORS: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

export const FASTING_WINDOWS = ["none", "16:8", "18:6", "omad"] as const;
export type FastingWindow = (typeof FASTING_WINDOWS)[number];

export const FASTING_LABELS: Record<FastingWindow, string> = {
  none: "안 함",
  "16:8": "16:8",
  "18:6": "18:6",
  omad: "하루 한 끼",
};

export const CUISINES = ["한식", "일식", "중식", "양식", "동남아", "분식"] as const;
export type Cuisine = (typeof CUISINES)[number];

export const SPICE_LABELS = ["안 매움", "약간", "보통", "매움", "아주 매움"];

/** 알러지 빠른 선택. 자유 입력도 함께 받는다. */
export const COMMON_ALLERGENS = [
  "계란",
  "우유",
  "땅콩",
  "견과류",
  "밀",
  "대두",
  "갑각류",
  "생선",
  "조개류",
  "복숭아",
  "토마토",
  "메밀",
] as const;

export type Profile = {
  /* 목표 */
  mode: DietModeId;

  /* 신체 — 목표 열량 계산에 쓴다. 비어 있으면 열량 목표 없이 추천한다. */
  sex: Sex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  activity: Activity;

  /* 제한과 안전 */
  restrictions: Restriction[];
  allergies: string[];
  /** 카니보어 모드에서 유제품을 허용할지. */
  allowDairy: boolean;

  /* 스케줄 */
  fastingWindow: FastingWindow;

  /* 취향 — 목표를 충족한 뒤의 동점 처리용 */
  spice: number; // 0~4
  maxMinutes: number;
  servings: number;
  cuisines: string[];
  dislikes: string;
};

export const DEFAULT_PROFILE: Profile = {
  mode: DEFAULT_MODE,
  sex: null,
  age: null,
  heightCm: null,
  weightKg: null,
  targetWeightKg: null,
  activity: "light",
  restrictions: [],
  allergies: [],
  allowDairy: true,
  fastingWindow: "none",
  spice: 2,
  maxMinutes: 30,
  servings: 2,
  cuisines: [],
  dislikes: "",
};

/* ---------- 재료 ---------- */

export type Ingredient = {
  name: string;
  category: string;
  confidence: "high" | "medium" | "low";
  note: string;
};

/* ---------- 레시피 ---------- */

/** 1인분 기준 추정치. 모델이 계산한 값이라 오차가 있다. */
export type Nutrition = {
  kcal: number;
  carb: number; // g
  protein: number; // g
  fat: number; // g
  fiber: number; // g
  sodium: number; // mg
};

export type Swap = {
  from: string;
  to: string;
  /** "-48kcal", "순탄수 -11g" 처럼 변화량을 숫자로. */
  effect: string;
};

export type Recipe = {
  name: string;
  summary: string;
  minutes: number;
  difficulty: "쉬움" | "보통" | "어려움";
  usedIngredients: string[];
  missingIngredients: string[];
  steps: string[];
  reason: string;

  /** 이 요리와 가장 가까운, 널리 쓰이는 한식 이름. 공공 DB 사진을 찾는 데 쓴다. */
  commonName: string;
  /**
   * 공공 레시피 DB에서 찾은 실사 사진. 모델이 아니라 서버가 붙인다.
   * 이름이 확실히 맞을 때만 붙으므로 대부분의 레시피에는 없다.
   */
  photo?: { url: string; dish: string } | null;

  /* 다이어터 버전에서 추가된 것 */
  nutrition: Nutrition;
  /** 총탄수 − 식이섬유. 키토 모드의 대표 지표. */
  netCarb: number;
  giLevel: "낮음" | "보통" | "높음";
  /** 선택한 모드에 얼마나 맞는지 0~100. */
  modeFit: number;
  modeReason: string;
  /** 혈당관리 모드에서 쓰는 먹는 순서. 다른 모드에서는 비어 있을 수 있다. */
  eatingOrder: string[];
  swaps: Swap[];
};

export type DinnerSession = {
  id: number;
  ingredients: Ingredient[];
  recipes: Recipe[];
  createdAt: string;
  /** 이 추천을 만들 때 쓴 모드. 지난 기록을 다시 볼 때 필요하다. */
  mode: DietModeId | null;
};

/** 서버가 걸러낸 레시피를 사용자에게 알려주기 위한 항목. */
export type DroppedRecipe = {
  name: string;
  reason: string;
};
