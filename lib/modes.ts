/**
 * 다이어트 모드 정의.
 *
 * 모드는 코드 분기가 아니라 데이터다. 추천 프롬프트는 여기 적힌 문장을 그대로 주입받고,
 * 화면은 primaryMetric을 보고 어떤 숫자를 크게 보여줄지 정한다.
 * 새 모드를 넣는 일은 이 배열에 객체 하나를 더하는 일이어야 한다.
 *
 * hardRules는 프롬프트에 들어가는 "사람이 읽는 문장"이고,
 * 실제 강제는 lib/rules.ts에서 응답을 받은 뒤 코드로 한다. 두 곳을 함께 고쳐야 한다.
 */

export const DIET_MODES = [
  "glycemic",
  "deficit",
  "bulk",
  "cut",
  "carnivore",
  "keto",
  "mediterranean",
] as const;

export type DietModeId = (typeof DIET_MODES)[number];

/** 결과 카드에서 가장 크게 보여줄 숫자. 모드마다 다르다. */
export type PrimaryMetric = "gl" | "kcal" | "protein" | "netCarb" | "animalRatio" | "foodGroups";

export type DietMode = {
  id: DietModeId;
  label: string;
  tagline: string;
  who: string;
  /** 열량 대비 탄단지 비율(%). 합이 100이 되게 유지한다. */
  macro: { carb: number; protein: number; fat: number };
  /** TDEE에 곱해 하루 목표 열량을 낸다. 1.0이면 유지 열량. */
  kcalFactor: number;
  /** 체중 kg당 단백질 목표. null이면 macro 비율에서 역산한다. */
  proteinPerKg: number | null;
  primaryMetric: PrimaryMetric;
  /** 프롬프트에 "반드시 지킬 것"으로 들어간다. */
  hardRules: string[];
  /** 프롬프트에 "가능하면 지킬 것"으로 들어간다. */
  softRules: string[];
  /** 모드 카드와 진입 시 띄우는 경고. 없으면 null. */
  warning: string | null;
  /** 다크 테마 위에서 읽히는 색. globals.css의 --mode-accent로 들어간다. */
  accent: string;
};

export const MODES: DietMode[] = [
  {
    id: "glycemic",
    label: "혈당관리",
    tagline: "식후 혈당이 덜 튀는 쪽으로",
    who: "식후 졸림·폭식이 잦은 사람, 혈당을 관리 중인 사람",
    macro: { carb: 35, protein: 30, fat: 35 },
    kcalFactor: 1.0,
    proteinPerKg: 1.2,
    primaryMetric: "gl",
    hardRules: [
      "정제 탄수화물(흰쌀밥, 흰빵, 밀가루면, 설탕)을 주재료로 쓰지 마세요.",
      "탄수화물이 들어가면 반드시 단백질이나 지방을 같이 넣어 혈당 상승을 완만하게 만드세요.",
      "설탕·물엿·시럽·과일주스를 넣지 마세요. 필요하면 알룰로스나 스테비아로 대체하세요.",
    ],
    softRules: [
      "통곡물, 콩류, 채소를 늘려 한 끼 식이섬유가 8g 이상 되게 하세요.",
      "eatingOrder에 채소 → 단백질 → 탄수화물 순서로 먹는 방법을 적으세요.",
      "giLevel에는 이 요리 전체의 혈당 반응을 낮음/보통/높음으로 판단해 적으세요.",
    ],
    warning: null,
    accent: "#85b3db",
  },
  {
    id: "deficit",
    label: "칼로리관리",
    tagline: "먹는 양이 아니라 숫자를 맞춘다",
    who: "감량 입문자, 숫자로 관리하는 게 편한 사람",
    macro: { carb: 40, protein: 30, fat: 30 },
    kcalFactor: 0.85,
    proteinPerKg: 1.4,
    primaryMetric: "kcal",
    hardRules: [
      "1인분 열량이 이번 끼니 목표 열량을 넘지 않게 하세요.",
      "튀김을 쓰지 마세요. 굽기·삶기·찌기·에어프라이로 조리하세요.",
    ],
    softRules: [
      "같은 재료라면 기름을 덜 쓰는 조리법을 고르세요.",
      "포만감이 큰 재료(단백질, 수분 많은 채소, 부피가 큰 것)를 늘리세요.",
      "swaps에는 열량을 줄일 수 있는 재료 교체를 적으세요.",
    ],
    warning: null,
    accent: "#7bc96f",
  },
  {
    id: "bulk",
    label: "근육증량",
    tagline: "단백질부터 채우고 나머지를 붙인다",
    who: "웨이트를 병행 중이고 체중·수행능력이 정체된 사람",
    macro: { carb: 45, protein: 30, fat: 25 },
    kcalFactor: 1.12,
    proteinPerKg: 1.8,
    primaryMetric: "protein",
    hardRules: [
      "1인분 단백질이 이번 끼니 목표 단백질 이상이어야 합니다.",
      "단백질 급원(육류, 생선, 계란, 유제품, 콩)을 최소 하나는 주재료로 쓰세요.",
    ],
    softRules: [
      "총 열량이 목표에 못 미치면 견과나 올리브유로 열량을 보태세요.",
      "탄수화물을 충분히 넣어 훈련에 쓸 연료를 확보하세요.",
      "reason에 단백질이 몇 g인지, 목표 대비 얼마인지 적으세요.",
    ],
    warning: null,
    accent: "#e09e6e",
  },
  {
    id: "cut",
    label: "체지방감소",
    tagline: "적자 중에도 단백질은 사수",
    who: "체중보다 체성분을 바꾸고 싶은 사람",
    macro: { carb: 30, protein: 40, fat: 30 },
    kcalFactor: 0.85,
    proteinPerKg: 2.0,
    primaryMetric: "protein",
    hardRules: [
      "1인분 단백질이 이번 끼니 목표 단백질 이상이어야 합니다.",
      "1인분 열량이 이번 끼니 목표 열량을 넘지 않게 하세요.",
      "설탕이 든 소스나 음료를 넣지 마세요.",
    ],
    softRules: [
      "탄수화물은 줄이되 0으로 만들지는 마세요. 채소와 통곡물로 채우세요.",
      "swaps에는 단백질을 유지하면서 열량을 낮추는 교체를 적으세요.",
    ],
    warning: null,
    accent: "#aba0e3",
  },
  {
    id: "carnivore",
    label: "카니보어",
    tagline: "동물성 식품만",
    who: "제거식이를 실험 중인 사람",
    macro: { carb: 0, protein: 30, fat: 70 },
    kcalFactor: 1.0,
    proteinPerKg: 1.6,
    primaryMetric: "animalRatio",
    hardRules: [
      "동물성 식품만 쓰세요. 육류, 내장, 생선, 해산물, 계란, 동물성 지방(버터·라드·우지), 소금만 허용합니다.",
      "채소, 과일, 곡물, 콩, 두부, 견과, 설탕, 식물성 기름, 밀가루, 전분을 절대 넣지 마세요.",
      "간장·고추장·된장·케첩 같은 식물성 발효 조미료나 소스를 쓰지 마세요.",
    ],
    softRules: [
      "유제품은 사용자가 허용한 경우에만 쓰세요.",
      "지방과 단백질의 비율이 무너지지 않게 지방이 붙은 부위를 고르세요.",
    ],
    warning: "식이섬유와 일부 비타민·미네랄이 부족해지기 쉽습니다. 장기간 유지할 계획이라면 전문가와 상의하세요.",
    accent: "#e38c89",
  },
  {
    id: "keto",
    label: "저탄고지 · 키토",
    tagline: "순탄수를 세는 식사",
    who: "식욕 억제가 필요한 사람, 초기 감량 속도를 원하는 사람",
    macro: { carb: 7, protein: 23, fat: 70 },
    kcalFactor: 0.9,
    proteinPerKg: 1.5,
    primaryMetric: "netCarb",
    hardRules: [
      "1인분 순탄수(총탄수 − 식이섬유)가 15g을 넘지 않게 하세요.",
      "설탕, 밥, 빵, 면, 감자, 고구마, 옥수수, 전분을 쓰지 마세요.",
      "단맛이 필요하면 알룰로스·에리스리톨·스테비아만 쓰세요.",
    ],
    softRules: [
      "지방은 버터, 올리브유, 아보카도, 견과에서 가져오세요.",
      "잎채소와 십자화과 채소로 부피를 채우세요.",
      "reason에 순탄수가 몇 g인지 적으세요.",
    ],
    warning: "초기에 나트륨·칼륨·마그네슘이 빠지기 쉽습니다. 수분과 전해질을 함께 챙기세요.",
    accent: "#d8af59",
  },
  {
    id: "mediterranean",
    label: "지중해식",
    tagline: "오래 지속하는 쪽에 걸기",
    who: "특정 목표 없이 건강하게 먹고 싶은 사람",
    macro: { carb: 45, protein: 20, fat: 35 },
    kcalFactor: 1.0,
    proteinPerKg: 1.2,
    primaryMetric: "foodGroups",
    hardRules: [
      "가공육(햄, 소시지, 베이컨)을 쓰지 마세요.",
      "지방은 올리브유를 우선으로 쓰세요.",
    ],
    softRules: [
      "생선·해산물, 채소, 통곡물, 콩, 견과를 고루 넣으세요.",
      "붉은 고기는 주재료로 쓰지 말고 곁들이는 정도로만 쓰세요.",
      "reason에 어떤 식품군을 채워주는지 적으세요.",
    ],
    warning: null,
    accent: "#67c2c6",
  },
];

export const MODE_MAP: Record<DietModeId, DietMode> = MODES.reduce(
  (map, mode) => {
    map[mode.id] = mode;
    return map;
  },
  {} as Record<DietModeId, DietMode>
);

export const DEFAULT_MODE: DietModeId = "mediterranean";

export function isDietModeId(value: unknown): value is DietModeId {
  return typeof value === "string" && (DIET_MODES as readonly string[]).includes(value);
}

export function getMode(id: string | null | undefined): DietMode {
  return isDietModeId(id) ? MODE_MAP[id] : MODE_MAP[DEFAULT_MODE];
}

/** 결과 카드에서 크게 띄울 지표의 표시 방법. */
export const METRIC_LABELS: Record<PrimaryMetric, string> = {
  gl: "혈당 반응",
  kcal: "열량",
  protein: "단백질",
  netCarb: "순탄수",
  animalRatio: "동물성",
  foodGroups: "식품군",
};
