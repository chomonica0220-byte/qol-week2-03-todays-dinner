# 🍳 오늘의 저녁

QOL Week2 과제 3 — **냉장고 사진을 올리면 오늘 만들 수 있는 요리를 알려주는 앱**

사진 속 재료를 이미지 인식으로 찾아내고, 저장해둔 내 취향(맵기·조리 시간·식단 제한·싫어하는 재료)에
맞춰 저녁 메뉴 3가지를 레시피와 함께 추천합니다.

## 과제 요구사항 충족

| 요구사항 | 구현 |
| --- | --- |
| 냉장고 사진 업로드 | 카메라 촬영(`capture="environment"`) 또는 앨범 선택. 업로드 전 브라우저에서 1536px로 리사이즈 |
| 이미지 인식 | **Claude API (Vision)** — `claude-opus-5` 모델에 이미지를 보내 재료 목록을 구조화 출력(JSON Schema)으로 수신 |
| 요리할 수 있는 것 알려줌 | 인식된 재료 + 사용자가 직접 보탠 재료로 요리 3개 추천. 각 요리마다 쓰는 재료 / 사야 하는 재료를 구분해 표시 |
| 성향에 따른 추천 | 맵기(5단계), 조리 시간, 인원, 식단 제한(베지테리언·비건·할랄·저탄수), 선호 요리 종류, 싫어하는 재료를 DB에 저장하고 매 추천에 반영 |

## 기술 스택

- **Next.js 14** (App Router) — 프론트엔드 + API를 한 프로젝트에서 처리하는 풀스택 구성
- **TypeScript**
- **Claude API** (`@anthropic-ai/sdk`) — Vision 이미지 인식 + 구조화 출력
- **PostgreSQL** (Supabase) — 취향과 추천 기록 영구 저장
- **Vercel** 배포

## 동작 흐름

```
사진 촬영 → 브라우저에서 리사이즈 → /api/analyze
                                        ↓ Claude Vision
                                   재료 목록(JSON)
                                        ↓ 사용자가 확인·수정
    DB에 저장된 내 취향  ────────→  /api/recommend
                                        ↓ Claude
                                 요리 3개 + 레시피 → DB 저장
```

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/profile?user=<key>` | 저장된 취향 조회 (없으면 기본값) |
| `PUT` | `/api/profile?user=<key>` | 취향 저장 |
| `POST` | `/api/analyze` | 이미지(base64) → 재료 목록 |
| `POST` | `/api/recommend?user=<key>` | 재료 + 취향 → 요리 추천 3개, 결과를 DB에 저장 |
| `GET` | `/api/history?user=<key>` | 최근 추천 기록 10건 |

로그인이 없으므로 브라우저가 `localStorage`에 만든 임의 키(`user`)로 사용자를 구분합니다.
서버는 이 키를 `^[A-Za-z0-9_-]{8,64}$` 로 검증합니다.

테이블 `dinner_profiles` / `dinner_sessions` 는 첫 요청 시 `CREATE TABLE IF NOT EXISTS` 로 자동 생성됩니다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY, DATABASE_URL 입력
npm run dev
```

http://localhost:3000 접속.

### API 키 발급

1. https://console.anthropic.com 접속 → 로그인
2. **API Keys → Create Key** 로 키 생성 (`sk-ant-...`)
3. `.env.local` 의 `ANTHROPIC_API_KEY` 에 입력
4. 배포 환경에서는 Vercel 프로젝트 환경 변수에 같은 이름으로 등록

키가 없으면 사진 분석과 추천 요청이 `503` 과 함께 안내 메시지를 반환합니다.

## 비용에 대한 참고

이미지는 업로드 전에 긴 변 1536px로 줄여서 보냅니다. 원본 사진을 그대로 보내는 것보다
토큰 사용량이 크게 줄어듭니다. 재료 인식은 `effort: low`, 메뉴 추천은 `effort: medium` 으로
호출해 품질과 비용을 나눠 잡았습니다.
