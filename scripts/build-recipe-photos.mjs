/**
 * 공공 레시피 DB에서 "요리 이름 → 사진 URL"만 뽑아 lib/recipe-photos.json 으로 굽는다.
 *
 *   node scripts/build-recipe-photos.mjs
 *
 * 런타임에는 이 JSON만 읽는다. 요청마다 공공 API를 부르지 않는 이유는,
 * 이 데이터가 거의 바뀌지 않는 고정 목록이라 매번 12번씩 왕복할 이유가 없어서다.
 * 데이터가 갱신되면 이 스크립트를 다시 돌려 커밋하면 된다.
 *
 * 출처: 식품의약품안전처 조리식품의 레시피 DB (COOKRCP01)
 * 키는 FOODSAFETY_KEY 환경 변수로 바꿀 수 있다. 없으면 공개 sample 키를 쓴다.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KEY = process.env.FOODSAFETY_KEY || "sample";
const BASE = `https://openapi.foodsafetykorea.go.kr/api/${KEY}/COOKRCP01/json`;
const PAGE = 100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "recipe-photos.json");

async function fetchPage(start) {
  const res = await fetch(`${BASE}/${start}/${start + PAGE - 1}`);
  if (!res.ok) throw new Error(`공공 API 응답 ${res.status}`);
  const json = await res.json();
  const body = json?.COOKRCP01;
  const code = body?.RESULT?.CODE;
  // 마지막 페이지를 넘어가면 INFO-200(해당 데이터 없음)이 온다. 오류가 아니다.
  if (code && code !== "INFO-000" && code !== "INFO-200") {
    throw new Error(`공공 API 오류 ${code}: ${body?.RESULT?.MSG}`);
  }
  return { rows: body?.row ?? [], total: Number(body?.total_count ?? 0) };
}

const rows = [];
let total = Infinity;
for (let start = 1; start <= total; start += PAGE) {
  const page = await fetchPage(start);
  if (page.total) total = page.total;
  if (!page.rows.length) break;
  rows.push(...page.rows);
  process.stdout.write(`\r받는 중… ${rows.length}/${total}`);
}
process.stdout.write("\n");

const seen = new Set();
const entries = [];
for (const row of rows) {
  const name = (row.RCP_NM ?? "").trim();
  const photo = (row.ATT_FILE_NO_MAIN ?? "").trim();
  if (!name || !photo || seen.has(name)) continue;
  seen.add(name);
  // 사진은 http로 오는데 앱은 https라 그대로 쓰면 혼합 콘텐츠로 차단된다.
  // 같은 호스트가 https도 받아주므로 스킴만 올린다.
  entries.push([name, photo.replace(/^http:\/\//, "https://")]);
}

entries.sort((a, b) => a[0].localeCompare(b[0], "ko"));

await writeFile(OUT, `${JSON.stringify(entries, null, 0)}\n`, "utf8");
console.log(`${entries.length}건을 ${OUT} 에 저장했습니다.`);
