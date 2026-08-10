"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ModePanel from "./components/ModePanel";
import ProfilePanel from "./components/ProfilePanel";
import RecipeCard from "./components/RecipeCard";
import { prepareImage } from "../lib/image";
import { getMode } from "../lib/modes";
import { computeTargets } from "../lib/nutrition";
import {
  DEFAULT_PROFILE,
  DinnerSession,
  DroppedRecipe,
  Ingredient,
  Profile,
  Recipe,
} from "../lib/types";

const USER_KEY_STORAGE = "todays-dinner:user";

function loadUserKey(): string {
  const existing = localStorage.getItem(USER_KEY_STORAGE);
  if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  const created = crypto.randomUUID().replace(/-/g, "");
  localStorage.setItem(USER_KEY_STORAGE, created);
  return created;
}

async function readError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return {
      message: typeof data?.error === "string" ? data.error : fallback,
      dropped: Array.isArray(data?.dropped) ? (data.dropped as DroppedRecipe[]) : [],
    };
  } catch {
    return { message: fallback, dropped: [] as DroppedRecipe[] };
  }
}

export default function Home() {
  const [userKey, setUserKey] = useState("");
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [profileOpen, setProfileOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [preview, setPreview] = useState("");
  const [pendingImage, setPendingImage] = useState<{ base64: string; mediaType: string } | null>(
    null
  );
  const [analyzing, setAnalyzing] = useState(false);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [comment, setComment] = useState("");
  const [manualInput, setManualInput] = useState("");

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [dropped, setDropped] = useState<DroppedRecipe[]>([]);
  const [recommending, setRecommending] = useState(false);

  const [history, setHistory] = useState<DinnerSession[]>([]);
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const mode = useMemo(() => getMode(profile.mode), [profile.mode]);
  const targets = useMemo(() => computeTargets(profile), [profile]);

  /* ---------- 초기 로딩 ---------- */

  useEffect(() => {
    const key = loadUserKey();
    setUserKey(key);

    let cancelled = false;
    (async () => {
      try {
        const [profileResponse, historyResponse] = await Promise.all([
          fetch(`/api/profile?user=${key}`, { cache: "no-store" }),
          fetch(`/api/history?user=${key}`, { cache: "no-store" }),
        ]);
        if (!cancelled && profileResponse.ok) setProfile(await profileResponse.json());
        if (!cancelled && historyResponse.ok) setHistory(await historyResponse.json());
      } catch {
        if (!cancelled) setError("저장된 정보를 불러오지 못했습니다.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- 설정 저장 (디바운스) ---------- */

  const updateProfile = useCallback(
    (next: Profile) => {
      setProfile(next);
      if (!userKey) return;

      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSavingProfile(true);
      saveTimer.current = setTimeout(async () => {
        try {
          const response = await fetch(`/api/profile?user=${userKey}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next),
          });
          if (!response.ok) {
            throw new Error((await readError(response, "설정을 저장하지 못했습니다.")).message);
          }
        } catch (saveError) {
          setError(saveError instanceof Error ? saveError.message : "설정을 저장하지 못했습니다.");
        } finally {
          setSavingProfile(false);
        }
      }, 600);
    },
    [userKey]
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  /* ---------- 사진 ---------- */

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setRecipes([]);
    setDropped([]);
    try {
      const prepared = await prepareImage(file);
      setPreview(prepared.previewUrl);
      setPendingImage({ base64: prepared.base64, mediaType: prepared.mediaType });
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : "이미지를 읽지 못했습니다.");
    }
  }, []);

  const clearImage = useCallback(() => {
    setPreview("");
    setPendingImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const analyze = useCallback(async () => {
    if (!pendingImage) return;
    setAnalyzing(true);
    setError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: pendingImage.base64,
          mediaType: pendingImage.mediaType,
        }),
      });
      if (!response.ok) {
        throw new Error((await readError(response, "사진을 분석하지 못했습니다.")).message);
      }

      const data: { ingredients: Ingredient[]; comment: string } = await response.json();
      // 이미 담아둔 재료는 유지하고, 새로 찾은 것만 합친다.
      setIngredients((prev) => {
        const seen = new Set(prev.map((item) => item.name));
        return [...prev, ...data.ingredients.filter((item) => !seen.has(item.name))];
      });
      setComment(data.comment);
    } catch (analyzeError) {
      setError(analyzeError instanceof Error ? analyzeError.message : "사진을 분석하지 못했습니다.");
    } finally {
      setAnalyzing(false);
    }
  }, [pendingImage]);

  /* ---------- 재료 ---------- */

  const addManual = useCallback(() => {
    const name = manualInput.trim();
    if (!name) return;
    setIngredients((prev) =>
      prev.some((item) => item.name === name)
        ? prev
        : [...prev, { name, category: "기타", confidence: "high", note: "직접 추가" }]
    );
    setManualInput("");
  }, [manualInput]);

  const removeIngredient = useCallback((name: string) => {
    setIngredients((prev) => prev.filter((item) => item.name !== name));
  }, []);

  /* ---------- 추천 ---------- */

  const recommend = useCallback(async () => {
    if (!userKey || !ingredients.length) return;
    setRecommending(true);
    setError("");
    setDropped([]);
    try {
      const response = await fetch(`/api/recommend?user=${userKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients }),
      });
      if (!response.ok) {
        const failure = await readError(response, "추천을 만들지 못했습니다.");
        setDropped(failure.dropped);
        throw new Error(failure.message);
      }

      const data: {
        id: number;
        createdAt: string;
        recipes: Recipe[];
        dropped: DroppedRecipe[];
      } = await response.json();

      setRecipes(data.recipes);
      setDropped(data.dropped ?? []);
      setHistory((prev) => [
        {
          id: data.id,
          createdAt: data.createdAt,
          ingredients,
          recipes: data.recipes,
          mode: profile.mode,
        },
        ...prev.slice(0, 9),
      ]);
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (recommendError) {
      setError(
        recommendError instanceof Error ? recommendError.message : "추천을 만들지 못했습니다."
      );
    } finally {
      setRecommending(false);
    }
  }, [userKey, ingredients, profile.mode]);

  /* ---------- 렌더링 ---------- */

  return (
    <main className="app" style={{ ["--mode-accent" as string]: mode.accent }}>
      <header>
        <p className="header__eyebrow">Diet Fridge</p>
        <h1 className="header__title">다이어터를 위한 냉장고를 부탁해</h1>
        <p className="header__desc">
          냉장고를 찍으면 <b>{mode.label}</b> 기준으로 오늘 먹을 요리를 골라드려요.
        </p>
      </header>

      {error ? <p className="notice notice--error">{error}</p> : null}

      <ModePanel profile={profile} targets={targets} onChange={updateProfile} />

      <ProfilePanel
        profile={profile}
        open={profileOpen}
        saving={savingProfile}
        onToggle={() => setProfileOpen((value) => !value)}
        onChange={updateProfile}
      />

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">
            <span className="step-badge">3</span>냉장고 사진
          </h2>
          {preview ? (
            <button type="button" className="link-button" onClick={clearImage}>
              다시 고르기
            </button>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          id="photo"
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />

        {preview ? (
          <div className="preview">
            <img src={preview} alt="업로드한 냉장고 사진" />
            <button
              type="button"
              className="preview__clear"
              onClick={clearImage}
              aria-label="사진 지우기"
            >
              ✕
            </button>
          </div>
        ) : (
          <label className="drop" htmlFor="photo">
            <span className="drop__icon" aria-hidden="true">
              📷
            </span>
            사진을 찍거나 앨범에서 고르세요
            <br />
            문을 열고 안쪽이 잘 보이게 찍으면 좋아요
          </label>
        )}

        {pendingImage ? (
          <div className="stack">
            <button
              type="button"
              className="button"
              onClick={() => void analyze()}
              disabled={analyzing}
            >
              {analyzing ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  재료를 찾는 중…
                </>
              ) : (
                "재료 찾기"
              )}
            </button>
          </div>
        ) : null}
      </section>

      {ingredients.length > 0 ? (
        <section className="card">
          <div className="card__head">
            <h2 className="card__title">
              <span className="step-badge">4</span>찾은 재료 {ingredients.length}개
            </h2>
          </div>
          {comment ? <p className="card__hint">{comment}</p> : null}

          <div className="chips" style={{ marginTop: 14 }}>
            {ingredients.map((item) => (
              <span
                key={item.name}
                className={`ingredient ${item.confidence === "low" ? "ingredient--low" : ""}`}
                title={item.note || undefined}
              >
                {item.name}
                <button
                  type="button"
                  className="ingredient__remove"
                  onClick={() => removeIngredient(item.name)}
                  aria-label={`${item.name} 빼기`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>

          <div className="add-row">
            <input
              className="text-input"
              value={manualInput}
              placeholder="빠진 재료 직접 추가"
              maxLength={30}
              onChange={(event) => setManualInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addManual();
                }
              }}
              aria-label="재료 직접 추가"
            />
            <button type="button" onClick={addManual} disabled={!manualInput.trim()}>
              추가
            </button>
          </div>

          <div className="stack">
            <button
              type="button"
              className="button"
              onClick={() => void recommend()}
              disabled={recommending}
            >
              {recommending ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  {mode.label} 기준으로 고르는 중…
                </>
              ) : (
                `${mode.label} 메뉴 추천받기`
              )}
            </button>
          </div>
        </section>
      ) : null}

      {dropped.length > 0 ? (
        <section className="card">
          <div className="card__head">
            <h2 className="card__title">걸러낸 요리 {dropped.length}개</h2>
          </div>
          <p className="card__hint">
            아래 요리는 규칙을 어겨서 서버가 결과에서 뺐습니다.
          </p>
          <ul className="dropped">
            {dropped.map((item) => (
              <li key={item.name}>
                <b>{item.name}</b>
                <span>{item.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {recipes.length > 0 ? (
        <section ref={resultsRef}>
          <div className="card__head" style={{ marginBottom: 12 }}>
            <h2 className="card__title">
              <span className="step-badge">5</span>오늘의 추천
            </h2>
          </div>
          {recipes.map((recipe, index) => (
            <RecipeCard
              key={recipe.name}
              recipe={recipe}
              rank={index + 1}
              mode={mode}
              targets={targets}
              userKey={userKey}
            />
          ))}
        </section>
      ) : null}

      {history.length > 0 ? (
        <section className="card">
          <div className="card__head">
            <h2 className="card__title">지난 추천</h2>
          </div>
          <div style={{ marginTop: 6 }}>
            {history.map((session) => (
              <div key={session.id} className="history__item">
                <p className="history__date">
                  {new Date(session.createdAt).toLocaleString("ko-KR", {
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {session.mode ? ` · ${getMode(session.mode).label}` : ""}
                </p>
                <p className="history__menus">
                  {session.recipes.map((recipe) => recipe.name).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <p className="disclaimer disclaimer--page">
        이 앱이 보여주는 영양 수치는 AI 추정값이며 의료·영양 조언이 아닙니다. 질환을 관리 중이라면
        담당 전문가의 지침을 우선하세요.
      </p>
    </main>
  );
}
