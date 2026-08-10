import { GoogleGenAI, Part, Schema, ThinkingLevel, Type } from "@google/genai";

declare global {
  // eslint-disable-next-line no-var
  var dinnerGenAI: GoogleGenAI | undefined;
}

export const MODEL = "gemini-3.5-flash";

export class MissingApiKeyError extends Error {
  constructor() {
    super("GOOGLE_API_KEY가 설정되지 않았습니다.");
    this.name = "MissingApiKeyError";
  }
}

export function genAI(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  if (!globalThis.dinnerGenAI) globalThis.dinnerGenAI = new GoogleGenAI({ apiKey });
  return globalThis.dinnerGenAI;
}

/** 구조화 출력(responseSchema)으로 JSON 응답을 받는다. */
export async function askForJson<T>(options: {
  system: string;
  parts: Part[];
  schema: Schema;
  thinking: ThinkingLevel;
  maxOutputTokens: number;
}): Promise<T> {
  const response = await genAI().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: options.parts }],
    config: {
      systemInstruction: options.system,
      responseMimeType: "application/json",
      responseSchema: options.schema,
      thinkingConfig: { thinkingLevel: options.thinking },
      maxOutputTokens: options.maxOutputTokens,
    },
  });

  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error("요청이 안전 필터에 걸렸습니다. 다른 사진으로 시도해주세요.");
  }

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    throw new Error("응답이 너무 길어 잘렸습니다. 재료 수를 줄이고 다시 시도해주세요.");
  }

  const text = response.text;
  if (!text) throw new Error("모델이 결과를 반환하지 않았습니다.");

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("모델 응답을 해석하지 못했습니다. 다시 시도해주세요.");
  }
}

/* ---------- 스키마 ---------- */

export const INGREDIENTS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    ingredients: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "재료 이름 (한국어, 예: 계란, 대파)" },
          category: {
            type: Type.STRING,
            enum: [
              "채소",
              "과일",
              "육류",
              "해산물",
              "유제품",
              "가공식품",
              "곡물",
              "양념",
              "음료",
              "기타",
            ],
          },
          confidence: {
            type: Type.STRING,
            enum: ["high", "medium", "low"],
            description: "사진에서 얼마나 확실하게 식별되는지",
          },
          note: { type: Type.STRING, description: "수량이나 상태 등 짧은 메모. 없으면 빈 문자열" },
        },
        required: ["name", "category", "confidence", "note"],
        propertyOrdering: ["name", "category", "confidence", "note"],
      },
    },
    comment: { type: Type.STRING, description: "사진 전반에 대한 한 문장 코멘트" },
  },
  required: ["ingredients", "comment"],
  propertyOrdering: ["ingredients", "comment"],
};

const NUTRITION_SCHEMA: Schema = {
  type: Type.OBJECT,
  description: "1인분 기준 추정 영양성분",
  properties: {
    kcal: { type: Type.INTEGER, description: "1인분 열량(kcal)" },
    carb: { type: Type.INTEGER, description: "총 탄수화물(g). 식이섬유를 포함한 값" },
    protein: { type: Type.INTEGER, description: "단백질(g)" },
    fat: { type: Type.INTEGER, description: "지방(g)" },
    fiber: { type: Type.INTEGER, description: "식이섬유(g)" },
    sodium: { type: Type.INTEGER, description: "나트륨(mg)" },
  },
  required: ["kcal", "carb", "protein", "fat", "fiber", "sodium"],
  propertyOrdering: ["kcal", "carb", "protein", "fat", "fiber", "sodium"],
};

const SWAP_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    from: { type: Type.STRING, description: "바꾸기 전 재료" },
    to: { type: Type.STRING, description: "바꾼 뒤 재료" },
    effect: {
      type: Type.STRING,
      description: '변화량을 숫자로. 예: "-48kcal", "순탄수 -11g"',
    },
  },
  required: ["from", "to", "effect"],
  propertyOrdering: ["from", "to", "effect"],
};

const RECIPE_FIELDS = [
  "name",
  "summary",
  "minutes",
  "difficulty",
  "usedIngredients",
  "missingIngredients",
  "steps",
  "reason",
  "nutrition",
  "netCarb",
  "giLevel",
  "modeFit",
  "modeReason",
  "eatingOrder",
  "swaps",
];

export const RECIPES_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    recipes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "요리 이름" },
          summary: { type: Type.STRING, description: "한 문장 소개" },
          minutes: { type: Type.INTEGER, description: "예상 조리 시간(분)" },
          difficulty: { type: Type.STRING, enum: ["쉬움", "보통", "어려움"] },
          usedIngredients: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "가진 재료 중 실제로 쓰는 것",
          },
          missingIngredients: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "추가로 사야 하는 재료. 없으면 빈 배열",
          },
          steps: { type: Type.ARRAY, items: { type: Type.STRING }, description: "조리 순서" },
          reason: { type: Type.STRING, description: "이 사용자에게 추천하는 이유" },
          nutrition: NUTRITION_SCHEMA,
          netCarb: {
            type: Type.INTEGER,
            description: "순탄수(g). 총 탄수화물에서 식이섬유를 뺀 값",
          },
          giLevel: {
            type: Type.STRING,
            enum: ["낮음", "보통", "높음"],
            description: "이 요리를 먹었을 때 예상되는 혈당 반응",
          },
          modeFit: {
            type: Type.INTEGER,
            description: "사용자가 고른 다이어트 모드에 얼마나 맞는지 0~100 점수",
          },
          modeReason: {
            type: Type.STRING,
            description: "그 점수를 준 근거를 한 문장으로. 숫자를 넣어 구체적으로",
          },
          eatingOrder: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              "혈당이 덜 오르게 먹는 순서. 혈당관리 모드가 아니면 빈 배열로 두세요",
          },
          swaps: {
            type: Type.ARRAY,
            items: SWAP_SCHEMA,
            description: "모드에 더 맞게 만드는 재료 교체 제안. 없으면 빈 배열",
          },
        },
        required: RECIPE_FIELDS,
        propertyOrdering: RECIPE_FIELDS,
      },
    },
  },
  required: ["recipes"],
  propertyOrdering: ["recipes"],
};
