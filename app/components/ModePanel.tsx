"use client";

import { MODES, getMode } from "../../lib/modes";
import { Targets } from "../../lib/nutrition";
import { MODE_RESTRICTION_CONFLICTS, Profile } from "../../lib/types";

type Props = {
  profile: Profile;
  targets: Targets | null;
  onChange: (next: Profile) => void;
};

export default function ModePanel({ profile, targets, onChange }: Props) {
  const mode = getMode(profile.mode);

  function selectMode(id: Profile["mode"]) {
    // 모드를 바꾸면 그 모드와 모순되는 제한은 같이 떨어뜨린다.
    // 서버도 같은 처리를 하지만, 화면에 남아 있으면 켜져 있는 것처럼 보인다.
    const conflicting = MODE_RESTRICTION_CONFLICTS[id] ?? [];
    onChange({
      ...profile,
      mode: id,
      restrictions: profile.restrictions.filter((item) => !conflicting.includes(item)),
    });
  }

  return (
    <section className="card" style={{ ["--mode-accent" as string]: mode.accent }}>
      <div className="card__head">
        <h2 className="card__title">
          <span className="step-badge">1</span>다이어트 모드
        </h2>
      </div>

      <div className="chips" style={{ marginTop: 14 }}>
        {MODES.map((item) => {
          const on = item.id === profile.mode;
          return (
            <button
              key={item.id}
              type="button"
              className={`chip ${on ? "chip--mode" : ""}`}
              aria-pressed={on}
              onClick={() => selectMode(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mode-detail">
        <p className="mode-detail__tagline">{mode.tagline}</p>
        <p className="mode-detail__who">{mode.who}</p>

        <div className="macro-bar" aria-hidden="true">
          <span className="macro-bar__seg macro-bar__seg--carb" style={{ width: `${mode.macro.carb}%` }} />
          <span
            className="macro-bar__seg macro-bar__seg--protein"
            style={{ width: `${mode.macro.protein}%` }}
          />
          <span className="macro-bar__seg macro-bar__seg--fat" style={{ width: `${mode.macro.fat}%` }} />
        </div>
        <p className="macro-bar__key">
          탄수 {mode.macro.carb}% · 단백질 {mode.macro.protein}% · 지방 {mode.macro.fat}%
        </p>

        {targets ? (
          <div className="target-grid">
            <div className="target">
              <span className="target__label">하루 목표</span>
              <b className="target__value">{targets.dailyKcal.toLocaleString()}kcal</b>
            </div>
            <div className="target">
              <span className="target__label">이번 끼니</span>
              <b className="target__value">{targets.mealKcal.toLocaleString()}kcal</b>
            </div>
            <div className="target">
              <span className="target__label">끼당 단백질</span>
              <b className="target__value">{targets.mealProtein}g</b>
            </div>
          </div>
        ) : (
          <p className="card__hint" style={{ marginTop: 12 }}>
            아래 「내 정보」에 성별·나이·키·몸무게를 넣으면 하루 목표 열량을 계산해서 추천에 반영합니다.
          </p>
        )}

        {targets?.floored ? (
          <p className="notice notice--warn" style={{ marginTop: 12 }}>
            계산된 목표가 하루 최소 열량보다 낮아 {targets.dailyKcal.toLocaleString()}kcal로 올렸습니다.
          </p>
        ) : null}

        <ul className="rule-list">
          {mode.hardRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>

        {mode.warning ? (
          <p className="notice notice--warn" style={{ marginTop: 12 }}>
            {mode.warning}
          </p>
        ) : null}
      </div>
    </section>
  );
}
