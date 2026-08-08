export const DIETS = ["none", "vegetarian", "vegan", "halal", "lowcarb"] as const;
export type Diet = (typeof DIETS)[number];

export const DIET_LABELS: Record<Diet, string> = {
  none: "가리는 것 없음",
  vegetarian: "베지테리언",
  vegan: "비건",
  halal: "할랄",
  lowcarb: "저탄수",
};

export const CUISINES = ["한식", "일식", "중식", "양식", "동남아", "분식"] as const;
export type Cuisine = (typeof CUISINES)[number];

export const SPICE_LABELS = ["안 매움", "약간", "보통", "매움", "아주 매움"];

export type Profile = {
  spice: number; // 0~4
  maxMinutes: number;
  servings: number;
  diet: Diet;
  cuisines: string[];
  dislikes: string;
};

export const DEFAULT_PROFILE: Profile = {
  spice: 2,
  maxMinutes: 30,
  servings: 2,
  diet: "none",
  cuisines: [],
  dislikes: "",
};

export type Ingredient = {
  name: string;
  category: string;
  confidence: "high" | "medium" | "low";
  note: string;
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
};

export type DinnerSession = {
  id: number;
  ingredients: Ingredient[];
  recipes: Recipe[];
  createdAt: string;
};
