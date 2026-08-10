"use client";

import { useState } from "react";
import { targetWeightWarning } from "../../lib/nutrition";
import {
  ACTIVITIES,
  ACTIVITY_LABELS,
  COMMON_ALLERGENS,
  CUISINES,
  FASTING_LABELS,
  FASTING_WINDOWS,
  MODE_RESTRICTION_CONFLICTS,
  Profile,
  RESTRICTIONS,
  RESTRICTION_LABELS,
  Restriction,
  SEXES,
  SEX_LABELS,
  SPICE_LABELS,
} from "../../lib/types";

type Props = {
  profile: Profile;
  open: boolean;
  saving: boolean;
  onToggle: () => void;
  onChange: (next: Profile) => void;
};

/** 비어 있는 입력은 0이 아니라 null로 둔다. 0kg은 미입력과 다른 뜻이다. */
function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function NumberField({
  id,
  label,
  unit,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: number | null;
  placeholder: string;
  onChange: (next: number | null) => void;
}) {
  return (
    <div className="num-field">
      <label className="num-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="num-field__input">
        <input
          id={id}
          className="text-input"
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(event) => onChange(toNumberOrNull(event.target.value))}
        />
        <span className="num-field__unit">{unit}</span>
      </div>
    </div>
  );
}

export default function ProfilePanel({ profile, open, saving, onToggle, onChange }: Props) {
  const [allergyInput, setAllergyInput] = useState("");

  const conflicting = MODE_RESTRICTION_CONFLICTS[profile.mode] ?? [];
  const weightWarning = targetWeightWarning(profile);
  const custom = profile.allergies.filter(
    (item) => !(COMMON_ALLERGENS as readonly string[]).includes(item)
  );

  const summary = [
    profile.weightKg ? `${profile.weightKg}kg` : "신체 정보 없음",
    `${profile.servings}인분`,
    `${profile.maxMinutes}분 이내`,
    profile.restrictions.length
      ? profile.restrictions.map((item) => RESTRICTION_LABELS[item]).join("·")
      : null,
    profile.allergies.length ? `알러지 ${profile.allergies.length}개` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function toggleRestriction(item: Restriction) {
    const on = profile.restrictions.includes(item);
    onChange({
      ...profile,
      restrictions: on
        ? profile.restrictions.filter((value) => value !== item)
        : [...profile.restrictions, item],
    });
  }

  function addAllergy(name: string) {
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed || profile.allergies.includes(trimmed)) return;
    onChange({ ...profile, allergies: [...profile.allergies, trimmed] });
  }

  function removeAllergy(name: string) {
    onChange({ ...profile, allergies: profile.allergies.filter((item) => item !== name) });
  }

  return (
    <section className="card">
      <div className="card__head">
        <h2 className="card__title">
          <span className="step-badge">2</span>내 정보
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
            <p className="field__label">성별</p>
            <div className="chips">
              {SEXES.map((sex) => (
                <button
                  key={sex}
                  type="button"
                  className={`chip ${profile.sex === sex ? "chip--on" : ""}`}
                  aria-pressed={profile.sex === sex}
                  onClick={() => onChange({ ...profile, sex: profile.sex === sex ? null : sex })}
                >
                  {SEX_LABELS[sex]}
                </button>
              ))}
            </div>
          </div>

          <div className="num-grid">
            <NumberField
              id="age"
              label="나이"
              unit="세"
              value={profile.age}
              placeholder="32"
              onChange={(age) => onChange({ ...profile, age })}
            />
            <NumberField
              id="height"
              label="키"
              unit="cm"
              value={profile.heightCm}
              placeholder="170"
              onChange={(heightCm) => onChange({ ...profile, heightCm })}
            />
            <NumberField
              id="weight"
              label="몸무게"
              unit="kg"
              value={profile.weightKg}
              placeholder="68"
              onChange={(weightKg) => onChange({ ...profile, weightKg })}
            />
            <NumberField
              id="target-weight"
              label="목표 체중"
              unit="kg"
              value={profile.targetWeightKg}
              placeholder="62"
              onChange={(targetWeightKg) => onChange({ ...profile, targetWeightKg })}
            />
          </div>

          {weightWarning ? (
            <p className="notice notice--warn" style={{ marginTop: 12 }}>
              {weightWarning}
            </p>
          ) : null}

          <div className="field">
            <p className="field__label">활동량</p>
            <div className="chips">
              {ACTIVITIES.map((activity) => (
                <button
                  key={activity}
                  type="button"
                  className={`chip ${profile.activity === activity ? "chip--on" : ""}`}
                  aria-pressed={profile.activity === activity}
                  onClick={() => onChange({ ...profile, activity })}
                >
                  {ACTIVITY_LABELS[activity]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <p className="field__label">간헐적 단식</p>
            <div className="chips">
              {FASTING_WINDOWS.map((fasting) => (
                <button
                  key={fasting}
                  type="button"
                  className={`chip ${profile.fastingWindow === fasting ? "chip--on" : ""}`}
                  aria-pressed={profile.fastingWindow === fasting}
                  onClick={() => onChange({ ...profile, fastingWindow: fasting })}
                >
                  {FASTING_LABELS[fasting]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <p className="field__label">식단 제한</p>
            <div className="chips">
              {RESTRICTIONS.map((item) => {
                const blocked = conflicting.includes(item);
                const on = profile.restrictions.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    className={`chip ${on ? "chip--on" : ""}`}
                    aria-pressed={on}
                    disabled={blocked}
                    title={blocked ? "지금 고른 다이어트 모드와 함께 쓸 수 없습니다." : undefined}
                    onClick={() => toggleRestriction(item)}
                  >
                    {RESTRICTION_LABELS[item]}
                  </button>
                );
              })}
            </div>
            {conflicting.length ? (
              <p className="card__hint">
                지금 모드와 맞지 않는 항목은 고를 수 없습니다.
              </p>
            ) : null}
          </div>

          {profile.mode === "carnivore" ? (
            <div className="field">
              <p className="field__label">유제품</p>
              <div className="chips">
                <button
                  type="button"
                  className={`chip ${profile.allowDairy ? "chip--on" : ""}`}
                  aria-pressed={profile.allowDairy}
                  onClick={() => onChange({ ...profile, allowDairy: true })}
                >
                  먹음
                </button>
                <button
                  type="button"
                  className={`chip ${!profile.allowDairy ? "chip--on" : ""}`}
                  aria-pressed={!profile.allowDairy}
                  onClick={() => onChange({ ...profile, allowDairy: false })}
                >
                  안 먹음
                </button>
              </div>
            </div>
          ) : null}

          <div className="field">
            <p className="field__label">알러지 · 절대 못 먹는 것</p>
            <div className="chips">
              {COMMON_ALLERGENS.map((item) => {
                const on = profile.allergies.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    className={`chip ${on ? "chip--danger" : ""}`}
                    aria-pressed={on}
                    onClick={() => (on ? removeAllergy(item) : addAllergy(item))}
                  >
                    {item}
                  </button>
                );
              })}
            </div>

            <div className="add-row">
              <input
                className="text-input"
                value={allergyInput}
                placeholder="목록에 없으면 직접 입력"
                maxLength={20}
                aria-label="알러지 직접 추가"
                onChange={(event) => setAllergyInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addAllergy(allergyInput);
                    setAllergyInput("");
                  }
                }}
              />
              <button
                type="button"
                disabled={!allergyInput.trim()}
                onClick={() => {
                  addAllergy(allergyInput);
                  setAllergyInput("");
                }}
              >
                추가
              </button>
            </div>

            {/* 위 프리셋 칩으로 이미 켜진 것은 다시 보여주지 않는다. 직접 입력한 것만 뺄 수 있게. */}
            {custom.length ? (
              <div className="chips" style={{ marginTop: 10 }}>
                {custom.map((item) => (
                  <span key={item} className="ingredient ingredient--danger">
                    {item}
                    <button
                      type="button"
                      className="ingredient__remove"
                      onClick={() => removeAllergy(item)}
                      aria-label={`${item} 빼기`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <p className="card__hint">
              여기 적은 것은 추천에서 무조건 빠집니다. 서버가 결과를 한 번 더 검사합니다.
            </p>
          </div>

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
              싫어하는 재료
            </label>
            <input
              id="dislikes"
              className="text-input"
              value={profile.dislikes}
              maxLength={200}
              placeholder="예: 오이, 고수"
              onChange={(event) => onChange({ ...profile, dislikes: event.target.value })}
            />
            <p className="card__hint">
              알러지와 달리 취향은 되도록 피하는 정도로만 반영합니다.
            </p>
          </div>

          <p className="card__hint" style={{ marginTop: 14 }}>
            {saving ? "저장 중…" : "변경하면 자동으로 저장됩니다."}
          </p>
        </>
      )}
    </section>
  );
}
