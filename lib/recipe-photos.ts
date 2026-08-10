import catalog from "./recipe-photos.json";

/**
 * 공공 레시피 DB의 실사 사진을 요리 이름으로 찾아 붙인다.
 *
 * 출처: 식품의약품안전처 조리식품의 레시피 DB (COOKRCP01).
 * 목록은 scripts/build-recipe-photos.mjs 로 구워둔 lib/recipe-photos.json 이다.
 *
 * 매칭은 일부러 엄격하게 한다. 토큰이 겹친다고 붙이면 "삼겹살 시금치 계란 볶음"에
 * "새우 두부 계란찜" 사진이 걸린다. 실제로 재보니 그런 오매칭이 대부분이었고,
 * 카니보어 레시피에 두부 사진이 붙는 식이라 사진이 없는 것보다 나빴다.
 * 확신이 없으면 붙이지 않는다 — 빈 자리는 거짓 정보보다 낫다.
 */

const ENTRIES = catalog as [string, string][];

/**
 * 이것만으로는 요리를 특정하지 못하는 말. 포함 관계 판정에서 제외한다.
 * 조리법과 형태를 가리키는 말만 넣는다 — "비빔밥"이나 "잡채"처럼
 * 그 자체로 특정 음식인 이름을 넣으면 멀쩡한 매칭이 죽는다.
 */
const TOO_GENERIC = new Set([
  "국", "밥", "찜", "탕", "죽", "면", "빵", "떡", "전", "쌈", "회",
  "볶음", "무침", "조림", "구이", "찌개", "튀김", "부침", "구이류",
  "김치", "나물", "샐러드", "요리", "반찬",
]);

/** 포함 관계로 인정하려면 짧은 쪽이 이만큼은 되어야 한다. */
const MIN_CONTAIN_LENGTH = 3;

function normalize(name: string): string {
  return name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s.,!?~"'`()[\]{}<>/\\|:;+*^%$#@=_·-]/g, "");
}

type Indexed = { name: string; photo: string; norm: string };

/** 모듈이 처음 로드될 때 한 번만 만든다. 1,100여 건이라 부담이 없다. */
const INDEX: Indexed[] = ENTRIES.map(([name, photo]) => ({
  name,
  photo,
  norm: normalize(name),
}));

const BY_NORM = new Map<string, Indexed>();
for (const item of INDEX) {
  if (!BY_NORM.has(item.norm)) BY_NORM.set(item.norm, item);
}

export type PhotoMatch = {
  url: string;
  /** 사진의 실제 요리 이름. 추천 이름과 다를 수 있어 화면에 함께 밝힌다. */
  dish: string;
};

function findOne(name: string): PhotoMatch | null {
  const query = normalize(name);
  if (!query) return null;

  // 완전 일치는 길이 제한을 받지 않는다. "잡채"는 두 글자지만 확실한 매칭이다.
  const exact = BY_NORM.get(query);
  if (exact) return { url: exact.photo, dish: exact.name };

  if (query.length < MIN_CONTAIN_LENGTH) return null;

  /*
   * 카탈로그는 "단호박제육볶음"처럼 흔한 요리에 수식어가 붙은 이름이 많다.
   * 그래서 "제육볶음"은 포함 관계로 걸린다. 후보가 여럿이면 길이 차가 가장 작은 것,
   * 즉 군더더기가 가장 적은 이름을 고른다.
   */
  let best: { item: Indexed; gap: number } | null = null;
  for (const item of INDEX) {
    const shorter = query.length <= item.norm.length ? query : item.norm;
    const longer = query.length <= item.norm.length ? item.norm : query;
    if (shorter.length < MIN_CONTAIN_LENGTH) continue;
    if (TOO_GENERIC.has(shorter)) continue;
    if (!longer.includes(shorter)) continue;

    const gap = longer.length - shorter.length;
    if (!best || gap < best.gap) best = { item, gap };
  }

  return best ? { url: best.item.photo, dish: best.item.name } : null;
}

/**
 * 추천 이름으로 먼저 찾고, 못 찾으면 모델이 준 일반 명칭으로 한 번 더 찾는다.
 * 모델은 재료를 조합해 이름을 창작하는데 공공 DB는 고정된 목록이라
 * 창작 이름만으로는 거의 안 걸린다.
 */
export function findPhoto(name: string, commonName?: string | null): PhotoMatch | null {
  return findOne(name) ?? (commonName ? findOne(commonName) : null);
}

export const CATALOG_SIZE = INDEX.length;
