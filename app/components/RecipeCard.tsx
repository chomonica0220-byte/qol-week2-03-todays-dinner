"use client";

import { useState } from "react";
import { Recipe } from "../../lib/types";

export default function RecipeCard({ recipe, rank }: { recipe: Recipe; rank: number }) {
  const [open, setOpen] = useState(rank === 1);
  const ready = recipe.missingIngredients.length === 0;

  return (
    <article className="recipe">
      <button
        type="button"
        className="recipe__head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="recipe__rank">추천 {rank}</span>
        <h3 className="recipe__name">{recipe.name}</h3>
        <p className="recipe__summary">{recipe.summary}</p>

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
            <h4>추천 이유</h4>
            <p>{recipe.reason}</p>
          </div>

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
        </div>
      ) : null}
    </article>
  );
}
