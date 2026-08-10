import { getMode } from "./modes";
import { Targets } from "./nutrition";
import {
  DroppedRecipe,
  Profile,
  Recipe,
  RESTRICTION_LABELS,
  Restriction,
} from "./types";

/**
 * 신뢰 경계.
 *
 * 모드의 하드룰과 알러지는 프롬프트로도 전달하지만, 그것만 믿지 않는다.
 * 모델 응답을 받은 뒤 여기서 다시 검사해서 어긴 레시피는 버린다.
 * "괜찮다"는 모델의 말은 근거가 아니다 — 특히 알러지는 안전 문제다.
 *
 * 키워드 매칭은 완벽하지 않다. 놓치는 쪽(위험)보다 과하게 거르는 쪽(불편)으로
 * 치우치게 목록을 짰다.
 */

/** 어느 집에나 있고 모든 모드에서 허용하는 것. 식물성 판정에서 제외한다. */
const BASIC_SEASONING = ["소금", "후추", "물", "얼음"];

const PLANT_KEYWORDS = [
  // 곡물·전분
  "쌀", "밥", "빵", "라면", "국수", "파스타", "스파게티", "우동", "칼국수", "소면", "냉면",
  "밀가루", "통밀", "부침가루", "튀김가루", "전분", "떡", "귀리", "보리", "호밀", "퀴노아",
  "옥수수", "감자", "고구마", "토르티야",
  // 콩·두부
  "콩", "두부", "두유", "유부", "된장", "고추장", "쌈장", "간장", "청국장",
  // 채소
  "양파", "대파", "쪽파", "실파", "마늘", "생강", "당근", "애호박", "호박", "배추", "양배추",
  // "가지"는 "여러 가지", "재료를 가지고"에 걸려서 뺐다. 아래 주석 참고.
  "상추", "시금치", "브로콜리", "토마토", "오이", "버섯", "고추", "피망", "파프리카",
  "무생채", "깍두기", "연근", "우엉", "부추", "깻잎", "쑥갓", "미나리", "콩나물", "숙주",
  "아스파라거스", "케일", "루꼴라", "샐러리", "비트", "올리브", "아보카도", "김치", "단무지",
  // 과일
  "사과", "바나나", "딸기", "포도", "귤", "오렌지", "레몬", "라임", "복숭아", "블루베리",
  "키위", "파인애플", "망고", "수박", "참외",
  // 견과·기름·당류
  "아몬드", "호두", "캐슈", "피스타치오", "마카다미아", "헤이즐넛", "잣", "땅콩", "견과",
  "참기름", "들기름", "올리브유", "식용유", "카놀라유", "포도씨유", "해바라기유",
  "설탕", "물엿", "올리고당", "시럽", "꿀", "케첩", "마요네즈", "머스터드", "식초", "미림", "맛술",
  "고춧가루", "참깨", "들깨",
  // 해조류는 식물성으로 본다.
  // "김"은 "김이 오르면"처럼 조리법 문장에 그대로 나오므로 낱말째로만 적는다.
  "김가루", "조미김", "미역", "다시마", "파래",
];

const DAIRY_KEYWORDS = [
  "우유", "치즈", "버터", "생크림", "휘핑", "요거트", "요구르트", "연유", "분유", "크림", "모짜렐라",
];

const MEAT_KEYWORDS = [
  "소고기", "쇠고기", "돼지", "삼겹살", "목살", "항정살", "닭", "오리", "양고기", "소불고기",
  "베이컨", "햄", "소시지", "스팸", "차돌", "등심", "안심", "갈비", "육수", "사골", "곱창",
  "소간", "닭간", "돼지간", "염통", "우삼겹", "다짐육", "미트",
];

/*
 * 키워드는 조리법 문장까지 통째로 훑는다. 그래서 흔한 낱말에 박히는 것은 넣으면 안 된다.
 * "무"는 "너무"에, "간"은 "중간에"와 "간장"에, "배"는 "고루 배게"에,
 * "가지"는 "여러 가지"와 "가지고"에, "김"은 "김이 오르면"에 걸린다.
 * 그래서 "무생채", "소간", "김가루"처럼 다른 낱말에 잘 안 박히는 형태로만 적는다.
 *
 * 이 목록을 늘릴 때는 그 낱말이 조리법 문장에 우연히 나올 수 있는지 먼저 생각할 것.
 * 잘못 걸리면 멀쩡한 레시피가 통째로 버려진다.
 */

const SEAFOOD_KEYWORDS = [
  "생선", "고등어", "연어", "참치", "갈치", "조기", "명태", "동태", "대구", "삼치", "멸치",
  "가자미", "광어", "우럭", "황태", "코다리", "새우", "꽃게", "대게", "게살", "크랩", "랍스터",
  "가재", "오징어", "낙지", "문어", "쭈꾸미", "주꾸미", "조개", "바지락", "홍합", "굴", "전복",
  "가리비", "꼬막", "소라", "액젓", "멸치육수", "가쓰오",
];

const EGG_KEYWORDS = ["계란", "달걀", "메추리알", "에그"];

const PORK_ALCOHOL_KEYWORDS = [
  "돼지", "삼겹살", "목살", "항정살", "베이컨", "햄", "소시지", "스팸", "라드", "젤라틴",
  "소주", "맥주", "와인", "청주", "미림", "맛술", "럼",
];

const GLUTEN_KEYWORDS = [
  "밀가루", "통밀", "빵", "라면", "국수", "파스타", "스파게티", "우동", "칼국수", "소면",
  "부침가루", "튀김가루", "크래커", "쿠키", "보리", "호밀", "맥주", "만두피", "빵가루",
];

/** 사용자가 고른 알러지 항목이 실제로 어떤 재료 이름으로 나타나는지. */
const ALLERGY_SYNONYMS: Record<string, string[]> = {
  계란: EGG_KEYWORDS,
  우유: DAIRY_KEYWORDS,
  땅콩: ["땅콩", "피넛"],
  견과류: ["아몬드", "호두", "캐슈", "피스타치오", "마카다미아", "헤이즐넛", "잣", "견과"],
  밀: GLUTEN_KEYWORDS,
  대두: ["대두", "콩", "두부", "두유", "된장", "간장", "고추장", "쌈장", "유부", "순두부"],
  갑각류: ["새우", "꽃게", "대게", "게살", "크랩", "랍스터", "가재"],
  생선: [
    "생선", "고등어", "연어", "참치", "갈치", "조기", "명태", "동태", "대구", "삼치", "멸치",
    "가자미", "광어", "우럭", "황태", "코다리", "액젓",
  ],
  조개류: ["조개", "바지락", "홍합", "굴", "전복", "가리비", "꼬막", "소라", "키조개"],
  복숭아: ["복숭아", "천도"],
  토마토: ["토마토", "케첩"],
  메밀: ["메밀", "막국수"],
};

const RESTRICTION_BLOCKS: Record<Restriction, string[]> = {
  vegan: [...MEAT_KEYWORDS, ...SEAFOOD_KEYWORDS, ...EGG_KEYWORDS, ...DAIRY_KEYWORDS, "꿀"],
  vegetarian: [...MEAT_KEYWORDS, ...SEAFOOD_KEYWORDS],
  halal: PORK_ALCOHOL_KEYWORDS,
  lactosefree: ["우유", "치즈", "생크림", "휘핑", "요거트", "요구르트", "연유", "분유", "크림"],
  glutenfree: GLUTEN_KEYWORDS,
};

/** 레시피에서 검사 대상이 되는 모든 텍스트. 조리법에만 등장하는 재료도 잡아야 한다. */
function scanText(recipe: Recipe): string {
  return [
    recipe.name,
    ...recipe.usedIngredients,
    ...recipe.missingIngredients,
    ...recipe.steps,
  ]
    .join(" ")
    .replace(/\s+/g, "");
}

function findKeyword(text: string, keywords: string[]): string | null {
  for (const keyword of keywords) {
    if (text.includes(keyword)) return keyword;
  }
  return null;
}

/** 사용자가 적은 알러지 문자열을 실제 재료 이름 목록으로 넓힌다. */
export function expandAllergy(entry: string): string[] {
  const trimmed = entry.trim();
  if (!trimmed) return [];
  const known = ALLERGY_SYNONYMS[trimmed];
  return known ? [trimmed, ...known] : [trimmed];
}

/**
 * 모델이 낸 영양값을 다듬는다.
 * netCarb은 총탄수 − 식이섬유로 정의되어 있으므로, 모델이 다르게 계산했으면 정의를 따른다.
 */
export function normalizeRecipe(recipe: Recipe): Recipe {
  const nutrition = {
    kcal: Math.max(0, Math.round(recipe.nutrition?.kcal ?? 0)),
    carb: Math.max(0, Math.round(recipe.nutrition?.carb ?? 0)),
    protein: Math.max(0, Math.round(recipe.nutrition?.protein ?? 0)),
    fat: Math.max(0, Math.round(recipe.nutrition?.fat ?? 0)),
    fiber: Math.max(0, Math.round(recipe.nutrition?.fiber ?? 0)),
    sodium: Math.max(0, Math.round(recipe.nutrition?.sodium ?? 0)),
  };

  return {
    ...recipe,
    nutrition,
    netCarb: Math.max(0, nutrition.carb - nutrition.fiber),
    modeFit: Math.min(100, Math.max(0, Math.round(recipe.modeFit ?? 0))),
    eatingOrder: Array.isArray(recipe.eatingOrder) ? recipe.eatingOrder : [],
    swaps: Array.isArray(recipe.swaps) ? recipe.swaps : [],
  };
}

/** 열량·단백질 판정에 두는 여유. 모델의 영양 추정 자체에 오차가 있다. */
const KCAL_TOLERANCE = 1.15;
const PROTEIN_TOLERANCE = 0.8;
/** 키토 한 끼 순탄수 상한. 하루 20~50g을 끼니로 나눈 값에 여유를 더했다. */
const KETO_NET_CARB_CEILING = 20;

function checkRecipe(
  recipe: Recipe,
  profile: Profile,
  targets: Targets | null
): string | null {
  const text = scanText(recipe);

  // 1. 알러지가 가장 우선이다.
  for (const entry of profile.allergies) {
    const hit = findKeyword(text, expandAllergy(entry));
    if (hit) return `알러지로 등록한 "${entry}"에 해당하는 재료(${hit})가 들어 있습니다.`;
  }

  // 2. 식이 제한
  for (const restriction of profile.restrictions) {
    const hit = findKeyword(text, RESTRICTION_BLOCKS[restriction]);
    if (hit) return `설정한 식단 제한에 맞지 않는 재료(${hit})가 들어 있습니다.`;
  }

  // 3. 모드 하드룰
  const mode = getMode(profile.mode);

  if (mode.id === "carnivore") {
    const plants = PLANT_KEYWORDS.filter((word) => !BASIC_SEASONING.includes(word));
    const hit = findKeyword(text, plants);
    if (hit) return `카니보어 모드인데 식물성 재료(${hit})가 들어 있습니다.`;
    if (!profile.allowDairy) {
      const dairy = findKeyword(text, DAIRY_KEYWORDS);
      if (dairy) return `유제품을 빼기로 했는데 ${dairy}이(가) 들어 있습니다.`;
    }
  }

  if (mode.id === "keto" && recipe.netCarb > KETO_NET_CARB_CEILING) {
    return `순탄수가 ${recipe.netCarb}g으로 키토 한 끼 상한(${KETO_NET_CARB_CEILING}g)을 넘습니다.`;
  }

  if (targets) {
    const capped = mode.id === "deficit" || mode.id === "cut";
    if (capped && recipe.nutrition.kcal > targets.mealKcal * KCAL_TOLERANCE) {
      return `1인분 ${recipe.nutrition.kcal}kcal로 이번 끼니 목표(${targets.mealKcal}kcal)를 크게 넘습니다.`;
    }

    const proteinLed = mode.id === "bulk" || mode.id === "cut";
    if (proteinLed && recipe.nutrition.protein < targets.mealProtein * PROTEIN_TOLERANCE) {
      return `단백질이 ${recipe.nutrition.protein}g으로 이번 끼니 목표(${targets.mealProtein}g)에 못 미칩니다.`;
    }
  }

  return null;
}

export function filterRecipes(
  recipes: Recipe[],
  profile: Profile,
  targets: Targets | null
): { kept: Recipe[]; dropped: DroppedRecipe[] } {
  const kept: Recipe[] = [];
  const dropped: DroppedRecipe[] = [];

  for (const raw of recipes) {
    const recipe = normalizeRecipe(raw);
    const problem = checkRecipe(recipe, profile, targets);
    if (problem) dropped.push({ name: recipe.name, reason: problem });
    else kept.push(recipe);
  }

  return { kept, dropped };
}

/** 검증에 쓰는 규칙을 프롬프트 문장으로도 내보낸다. 두 곳이 같은 목록을 보게 하기 위함이다. */
export function restrictionPromptLines(profile: Profile): string[] {
  const lines: string[] = [];

  if (profile.allergies.length) {
    const expanded = profile.allergies.flatMap(expandAllergy);
    lines.push(
      `- 알러지(절대 금지): ${profile.allergies.join(", ")}. ` +
        `다음 재료도 모두 제외하세요: ${Array.from(new Set(expanded)).join(", ")}`
    );
  }

  for (const restriction of profile.restrictions) {
    lines.push(
      `- 식단 제한: ${RESTRICTION_LABELS[restriction]}. 다음 재료를 쓰지 마세요: ` +
        `${RESTRICTION_BLOCKS[restriction].slice(0, 20).join(", ")} 등`
    );
  }

  return lines;
}
