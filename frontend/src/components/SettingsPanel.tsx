import { useState } from 'react';
import type { Settings } from '../types';
import uiText from '../../../shared/config/ui-text.json';
import officialsConfig from '../../../shared/config/officials.json';

interface Props {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

const ALL_OFFICIALS = Object.values(officialsConfig.officials);

const PROVIDERS = ['deepseek', 'gemini', 'glm4', 'openai', 'custom'] as const;

export function SettingsPanel({ settings, onUpdate, onClose }: Props) {
  const [aiExpanded, setAiExpanded] = useState(false);

  function toggleOfficial(id: string) {
    const current = settings.selectedOfficials;
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    onUpdate({ selectedOfficials: next });
  }

  function updateUserKey(patch: Partial<NonNullable<Settings['userKey']>>) {
    onUpdate({
      userKey: {
        provider: settings.userKey?.provider ?? 'deepseek',
        apiKey: settings.userKey?.apiKey ?? '',
        model: settings.userKey?.model ?? '',
        baseUrl: settings.userKey?.baseUrl ?? '',
        ...patch,
      },
    });
  }

  const t = uiText.settings;

  return (
    <div className="settings-panel">
      <div className="settings-panel__header">
        <span className="settings-panel__title">{t.title}</span>
        <button className="settings-panel__close btn btn--ghost" onClick={onClose}>
          {t.close}
        </button>
      </div>

      <div className="settings-panel__body">
        {/* 1. 发言长度 */}
        <section className="settings-section">
          <label className="settings-section__label">{t.length.label}</label>
          <div className="settings-section__options">
            {(['short', 'medium', 'long'] as const).map((v) => (
              <button
                key={v}
                className={`btn btn--option ${settings.length === v ? 'btn--option--active' : ''}`}
                onClick={() => onUpdate({ length: v })}
              >
                {t.length[v]}
              </button>
            ))}
          </div>
        </section>

        {/* 2. 辩论轮次 */}
        <section className="settings-section">
          <label className="settings-section__label">{t.rounds.label}</label>
          <div className="settings-section__options">
            {([1, 2, 3] as const).map((v) => (
              <button
                key={v}
                className={`btn btn--option ${settings.rounds === v ? 'btn--option--active' : ''}`}
                onClick={() => onUpdate({ rounds: v })}
              >
                {t.rounds[`round${v}` as 'round1' | 'round2' | 'round3']}
              </button>
            ))}
          </div>
        </section>

        {/* 3. 文言程度 */}
        <section className="settings-section">
          <label className="settings-section__label">{t.style.label}</label>
          <div className="settings-section__options">
            {(['modern', 'classical'] as const).map((v) => (
              <button
                key={v}
                className={`btn btn--option ${settings.style === v ? 'btn--option--active' : ''}`}
                onClick={() => onUpdate({ style: v })}
              >
                {t.style[v]}
              </button>
            ))}
          </div>
        </section>

        {/* 4. 参与官员 */}
        <section className="settings-section">
          <label className="settings-section__label">{t.officials.label}</label>
          <div className="settings-section__officials">
            {ALL_OFFICIALS.map((o) => (
              <label key={o.id} className="official-checkbox">
                <input
                  type="checkbox"
                  checked={settings.selectedOfficials.includes(o.id)}
                  onChange={() => toggleOfficial(o.id)}
                />
                <span className="official-checkbox__rank">{o.rank}品</span>
                <span className="official-checkbox__name">{o.name}</span>
              </label>
            ))}
          </div>
        </section>

        {/* 5. 打字机速度 */}
        <section className="settings-section">
          <label className="settings-section__label">{t.typingSpeed.label}</label>
          <div className="settings-section__options">
            {(['fast', 'slow'] as const).map((v) => (
              <button
                key={v}
                className={`btn btn--option ${settings.typingSpeed === v ? 'btn--option--active' : ''}`}
                onClick={() => onUpdate({ typingSpeed: v })}
              >
                {t.typingSpeed[v]}
              </button>
            ))}
          </div>
        </section>

        {/* 6. AI 设置（折叠） */}
        <section className="settings-section">
          <button
            className="settings-section__collapse-toggle"
            onClick={() => setAiExpanded((v) => !v)}
          >
            <span className="settings-section__label">{t.aiConfig.label}</span>
            <span className="settings-section__collapse-icon">
              {aiExpanded ? t.aiConfig.collapse : t.aiConfig.expand}
            </span>
          </button>

          {aiExpanded && (
            <div className="settings-section__ai-config">
              <div className="form-row">
                <label className="form-row__label">{t.aiConfig.provider}</label>
                <select
                  className="form-row__select"
                  value={settings.userKey?.provider ?? ''}
                  onChange={(e) => updateUserKey({ provider: e.target.value })}
                >
                  <option value="">—</option>
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <label className="form-row__label">{t.aiConfig.apiKey}</label>
                <input
                  type="password"
                  className="form-row__input"
                  placeholder={t.aiConfig.apiKeyPlaceholder}
                  value={settings.userKey?.apiKey ?? ''}
                  onChange={(e) => updateUserKey({ apiKey: e.target.value })}
                  autoComplete="off"
                />
              </div>

              <div className="form-row">
                <label className="form-row__label">{t.aiConfig.baseUrl}</label>
                <input
                  type="text"
                  className="form-row__input"
                  placeholder={t.aiConfig.baseUrlPlaceholder}
                  value={settings.userKey?.baseUrl ?? ''}
                  onChange={(e) => updateUserKey({ baseUrl: e.target.value })}
                />
              </div>

              <div className="form-row">
                <label className="form-row__label">{t.aiConfig.modelName}</label>
                <input
                  type="text"
                  className="form-row__input"
                  placeholder={t.aiConfig.modelNamePlaceholder}
                  value={settings.userKey?.model ?? ''}
                  onChange={(e) => updateUserKey({ model: e.target.value })}
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
