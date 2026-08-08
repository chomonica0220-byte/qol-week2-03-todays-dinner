"use client";

import { CUISINES, DIETS, DIET_LABELS, Profile, SPICE_LABELS } from "../../lib/types";

type Props = {
  profile: Profile;
  open: boolean;
  saving: boolean;
  onToggle: () => void;
  onChange: (next: Profile) => void;
};

export default function ProfilePanel({ profile, open, saving, onToggle, onChange }: Props) {
  const summary = [
    SPICE_LABELS[profile.spice],
    `${profile.maxMinutes}분 이내`,
    `${profile.servings}인분`,
    profile.diet === "none" ? null : DIET_LABELS[profile.diet],
    profile.cuisines.length ? profile.cuisines.join("·") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="card">
      <div className="card__head">
        <h2 className="card__title">
          <span className="step-badge">1</span>내 취향
        </h2>
        <button type="button" className="link-button" onClick={onToggle}>
          {open ? "접기" : "수정"}
        </button>
      </div>

      {!open ? (
        <p className="card__hint">{summary}</p>
      ) : (
        <>
          <div className="field">
            <label className="field__label" htmlFor="spice">
              <span>맵기</span>
              <span className="field__value">{SPICE_LABELS[profile.spice]}</span>
            </label>
            <input
              id="spice"
              className="slider"
              type="range"
              min={0}
              max={4}
              step={1}
              value={profile.spice}
              onChange={(event) => onChange({ ...profile, spice: Number(event.target.value) })}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="minutes">
              <span>조리 시간</span>
              <span className="field__value">{profile.maxMinutes}분 이내</span>
            </label>
            <input
              id="minutes"
              className="slider"
              type="range"
              min={10}
              max={90}
              step={5}
              value={profile.maxMinutes}
              onChange={(event) => onChange({ ...profile, maxMinutes: Number(event.target.value) })}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="servings">
              <span>인원</span>
              <span className="field__value">{profile.servings}인분</span>
            </label>
            <input
              id="servings"
              className="slider"
              type="range"
              min={1}
              max={6}
              step={1}
              value={profile.servings}
              onChange={(event) => onChange({ ...profile, servings: Number(event.target.value) })}
            />
          </div>

          <div className="field">
            <p className="field__label">식단 제한</p>
            <div className="chips">
              {DIETS.map((diet) => (
                <button
                  key={diet}
                  type="button"
                  className={`chip ${profile.diet === diet ? "chip--on" : ""}`}
                  onClick={() => onChange({ ...profile, diet })}
                  aria-pressed={profile.diet === diet}
                >
                  {DIET_LABELS[diet]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <p className="field__label">좋아하는 요리 종류</p>
            <div className="chips">
              {CUISINES.map((cuisine) => {
                const on = profile.cuisines.includes(cuisine);
                return (
                  <button
                    key={cuisine}
                    type="button"
                    className={`chip ${on ? "chip--on" : ""}`}
                    aria-pressed={on}
                    onClick={() =>
                      onChange({
                        ...profile,
                        cuisines: on
                          ? profile.cuisines.filter((item) => item !== cuisine)
                          : [...profile.cuisines, cuisine],
                      })
                    }
                  >
                    {cuisine}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="dislikes">
              싫어하는 재료 · 못 먹는 것
            </label>
            <input
              id="dislikes"
              className="text-input"
              value={profile.dislikes}
              maxLength={200}
              placeholder="예: 오이, 고수, 갑각류 알레르기"
              onChange={(event) => onChange({ ...profile, dislikes: event.target.value })}
            />
          </div>

          <p className="card__hint" style={{ marginTop: 14 }}>
            {saving ? "저장 중…" : "변경하면 자동으로 저장됩니다."}
          </p>
        </>
      )}
    </section>
  );
}
