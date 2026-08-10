import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool, readUserKey } from "../../../lib/db";
import { MissingApiKeyError } from "../../../lib/gemini";
import { IMAGE_MODEL, ImageQuotaError, getOrCreateImage } from "../../../lib/images";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_NAME_LENGTH = 40;

/**
 * 이 사용자가 실제로 추천받은 요리인지 본다.
 *
 * 없으면 아무나 name만 바꿔가며 호출해서 남의 API 키로 이미지를 뽑아낼 수 있다.
 * 이름을 프롬프트에 넣는 엔드포인트라 여기서 막지 않으면 열린 이미지 생성기가 된다.
 */
async function userOwnsRecipe(userKey: string, name: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM dinner_sessions
      WHERE user_key = $1 AND recipes @> $2::jsonb
      LIMIT 1`,
    [userKey, JSON.stringify([{ name }])]
  );
  return (rowCount ?? 0) > 0;
}

export async function GET(request: NextRequest) {
  const userKey = readUserKey(request);
  if (!userKey) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const name = (new URL(request.url).searchParams.get("name") ?? "").trim();
  if (!name || name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: "요리 이름이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    await ensureSchema();

    if (!(await userOwnsRecipe(userKey, name))) {
      return NextResponse.json({ error: "추천받은 적 없는 요리입니다." }, { status: 403 });
    }

    let image;
    try {
      image = await getOrCreateImage(name);
    } catch (generationError) {
      if (generationError instanceof ImageQuotaError) {
        // 무료 등급에서는 이미지 모델 한도가 0이다. 서버 문제가 아니라 요금제 문제라
        // 상태 코드를 나눠둔다. 카드는 사진 자리를 비우고 계속 동작한다.
        return NextResponse.json(
          {
            error: "이미지 생성 할당량이 없습니다. Google AI Studio에서 결제를 활성화하세요.",
            model: IMAGE_MODEL,
          },
          { status: 503 }
        );
      }
      // 소유권 검사를 통과한 뒤에만 닿는 곳이라 원인을 그대로 알려준다.
      // 모델 이름 오타 같은 건 감춰봐야 고칠 수가 없다.
      const reason =
        generationError instanceof Error ? generationError.message : String(generationError);
      console.error("recipe image generation failed", generationError);
      return NextResponse.json(
        { error: "사진을 만들지 못했습니다.", model: IMAGE_MODEL, reason: reason.slice(0, 600) },
        { status: 502 }
      );
    }

    if (!image) {
      return NextResponse.json(
        { error: "모델이 이미지를 돌려주지 않았습니다.", model: IMAGE_MODEL },
        { status: 502 }
      );
    }

    const body = Buffer.from(image.data, "base64");
    return new NextResponse(body, {
      headers: {
        "Content-Type": image.mime,
        "Content-Length": String(body.byteLength),
        // 요리 이름이 같으면 그림도 같다. 브라우저와 CDN이 오래 들고 있게 둔다.
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Image-Origin": image.origin,
      },
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: "서버에 GOOGLE_API_KEY가 설정되지 않았습니다." },
        { status: 503 }
      );
    }
    console.error("GET /api/recipe-image failed", error);
    // 사진은 없어도 레시피는 쓸 수 있다. 카드가 조용히 자리만 비우도록 404로 돌려준다.
    return NextResponse.json({ error: "사진을 불러오지 못했습니다." }, { status: 404 });
  }
}
