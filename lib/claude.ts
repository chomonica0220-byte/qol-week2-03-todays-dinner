import Anthropic from "@anthropic-ai/sdk";

declare global {
  // eslint-disable-next-line no-var
  var dinnerAnthropic: Anthropic | undefined;
}

export const MODEL = "claude-opus-5";

export class MissingApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY가 설정되지 않았습니다.");
    this.name = "MissingApiKeyError";
  }
}

export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingApiKeyError();
  if (!globalThis.dinnerAnthropic) {
    globalThis.dinnerAnthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return globalThis.dinnerAnthropic;
}

/**
 * 구조화 출력(JSON Schema)으로 응답을 받는다.
 * 스키마의 모든 객체에는 additionalProperties: false 와 required 가 필요하다.
 */
export async function askForJson<T>(options: {
  system: string;
  content: Anthropic.ContentBlockParam[];
  schema: Record<string, unknown>;
  effort: "low" | "medium" | "high";
  maxTokens: number;
}): Promise<T> {
  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: options.maxTokens,
    system: options.system,
    thinking: { type: "adaptive" },
    output_config: {
      effort: options.effort,
      format: { type: "json_schema", schema: options.schema },
    },
    messages: [{ role: "user", content: options.content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("요청이 안전 정책에 의해 거절되었습니다. 다른 사진으로 시도해주세요.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("응답이 너무 길어 잘렸습니다. 잠시 후 다시 시도해주세요.");
  }

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("모델이 결과를 반환하지 않았습니다.");
  }
  return JSON.parse(text.text) as T;
}

/* ---------- 스키마 ---------- */

export const INGREDIENTS_SCHEMA = {
  type: "object",
  properties: {
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "재료 이름 (한국어, 예: 계란, 대파)" },
          category: {
            type: "string",
            enum: ["채소", "과일", "육류", "해산물", "유제품", "가공식품", "곡물", "양념", "음료", "기타"],
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "사진에서 얼마나 확실하게 식별되는지",
          },
          note: { type: "string", description: "수량이나 상태 등 짧은 메모. 없으면 빈 문자열" },
        },
        required: ["name", "category", "confidence", "note"],
        additionalProperties: false,
      },
    },
    comment: { type: "string", description: "사진 전반에 대한 한 문장 코멘트" },
  },
  required: ["ingredients", "comment"],
  additionalProperties: false,
} as const;

export const RECIPES_SCHEMA = {
  type: "object",
  properties: {
    recipes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "요리 이름" },
          summary: { type: "string", description: "한 문장 소개" },
          minutes: { type: "integer", description: "예상 조리 시간(분)" },
          difficulty: { type: "string", enum: ["쉬움", "보통", "어려움"] },
          usedIngredients: {
            type: "array",
            items: { type: "string" },
            description: "가진 재료 중 실제로 쓰는 것",
          },
          missingIngredients: {
            type: "array",
            items: { type: "string" },
            description: "추가로 사야 하는 재료. 없으면 빈 배열",
          },
          steps: { type: "array", items: { type: "string" }, description: "조리 순서" },
          reason: { type: "string", description: "이 사용자에게 추천하는 이유" },
        },
        required: [
          "name",
          "summary",
          "minutes",
          "difficulty",
          "usedIngredients",
          "missingIngredients",
          "steps",
          "reason",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["recipes"],
  additionalProperties: false,
} as const;
