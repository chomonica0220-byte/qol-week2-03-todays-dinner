"use client";

import { useState } from "react";
import { DietMode } from "../../lib/modes";
import { Targets } from "../../lib/nutrition";
import { Recipe } from "../../lib/types";

/**
 * 모드마다 크게 보여줄 숫자가 다르다. 혈당관리는 혈당 반응, 근육증량은 단백질,
 * 키토는 순탄수. 같은 레시피라도 모드가 바뀌면 카드의 얼굴이 바뀐다.
 */
function primaryStat(recipe: Recipe, mode: DietMode): { label: string; value: string } {
  switch (mode.primaryMetric) {
    case "gl":
      return { label: "혈당 반응", value: recipe.giLevel };
    case "protein":
      return { label: "단백질", value: `${recipe.nutrition.protein}g` };
    case "netCarb":
      return { label: "순탄수", value: `${recipe.netCarb}g` };
    case "animalRatio":
      return {
        label: "지방 : 단백질",
        value: `${recipe.nutrition.fat} : ${recipe.nutrition.protein}g`,
      };
    default:
      return { label: "열량", value: `${recipe.nutrition.kcal.toLocaleString()}kcal` };
  }
}

function fitTone(fit: number): string {
  if (fit >= 80) return "fit--high";
  if (fit >= 60) return "fit--mid";
  return "fit--low";
}

export default function RecipeCard({
  recipe,
  rank,
  mode,
  targets,
}: {
  recipe: Recipe;
  rank: number;
  mode: DietMode;
  targets: Targets | null;
}) {
  const [open, setOpen] = useState(rank === 1);
  const ready = recipe.missingIngredients.length === 0;
  const stat = primaryStat(recipe, mode);

  // 큰 숫자가 이미 열량이면 옆에 열량을 또 보여주지 않는다.
  const showsKcalAsPrimary =
    mode.primaryMetric === "kcal" || mode.primaryMetric === "foodGroups";
  const kcalDelta = targets ? recipe.nutrition.kcal - targets.mealKcal : null;

  return (
    <article className="recipe" style={{ ["--mode-accent" as string]: mode.accent }}>
      <button
        type="button"
        className="recipe__head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <div className="recipe__toprow">
          <span className="recipe__rank">추천 {rank}</span>
          <span className={`fit ${fitTone(recipe.modeFit)}`}>
            {mode.label} 적합도 {recipe.modeFit}
          </span>
        </div>

        <h3 className="recipe__name">{recipe.name}</h3>
        <p className="recipe__summary">{recipe.summary}</p>

        <div className="stat">
          <span className="stat__label">{stat.label}</span>
          <b className="stat__value">{stat.value}</b>
          {kcalDelta !== null && !showsKcalAsPrimary ? (
            <span className="stat__side">
              {recipe.nutrition.kcal.toLocaleString()}kcal
              <span className={kcalDelta > 0 ? "delta delta--over" : "delta delta--under"}>
                {kcalDelta > 0 ? `목표 +${kcalDelta}` : `목표 ${kcalDelta}`}
              </span>
            </span>
          ) : null}
        </div>

        <div className="nutri">
          <span className="nutri__item">
            탄 <b>{recipe.nutrition.carb}g</b>
          </span>
          <span className="nutri__item">
            단 <b>{recipe.nutrition.protein}g</b>
          </span>
          <span className="nutri__item">
            지 <b>{recipe.nutrition.fat}g</b>
          </span>
          <span className="nutri__item">
            섬유 <b>{recipe.nutrition.fiber}g</b>
          </span>
          <span className="nutri__item">
            나트륨 <b>{recipe.nutrition.sodium.toLocaleString()}mg</b>
          </span>
        </div>

        <div className="recipe__meta">
          <span className="tag">⏱ {recipe.minutes}분</span>
          <span className="tag">난이도 {recipe.difficulty}</span>
          {ready ? (
            <span className="tag tag--ready">지금 바로 가능</span>
          ) : (
            <span className="tag tag--buy">{recipe.missingIngredients.length}개 더 필요</span>
          )}
          <span className="tag">{open ? "접기 ▲" : "레시피 보기 ▼"}</span>
        </div>
      </button>

      {open ? (
        <div className="recipe__body">
          <div className="recipe__section">
            <h4>{mode.label} 모드에 맞는 이유</h4>
            <p>{recipe.modeReason}</p>
            <p style={{ marginTop: 8 }}>{recipe.reason}</p>
          </div>

          {recipe.swaps.length ? (
            <div className="recipe__section">
              <h4>이렇게 바꾸면 더 맞아요</h4>
              <ul className="swaps">
                {recipe.swaps.map((swap) => (
                  <li key={`${swap.from}-${swap.to}`}>
                    <span className="swaps__from">{swap.from}</span>
                    <span className="swaps__arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="swaps__to">{swap.to}</span>
                    <span className="swaps__effect">{swap.effect}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {recipe.eatingOrder.length ? (
            <div className="recipe__section">
              <h4>먹는 순서</h4>
              <ol className="eat-order">
                {recipe.eatingOrder.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="recipe__section">
            <h4>쓰는 재료</h4>
            <div className="chips">
              {recipe.usedIngredients.map((item) => (
                <span key={item} className="chip">
                  {item}
                </span>
              ))}
            </div>
          </div>

          {recipe.missingIngredients.length > 0 ? (
            <div className="recipe__section">
              <h4>사야 하는 재료</h4>
              <div className="chips">
                {recipe.missingIngredients.map((item) => (
                  <span key={item} className="chip" style={{ color: "var(--accent)" }}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="recipe__section">
            <h4>만드는 법</h4>
            <ol className="steps">
              {recipe.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>

          <p className="disclaimer">
            영양 수치는 AI가 재료에서 추정한 값입니다. 실제와 차이가 있을 수 있고, 의료·영양 조언이
            아닙니다.
          </p>
        </div>
      ) : null}
    </article>
  );
}
