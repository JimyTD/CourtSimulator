import { useState, useEffect } from 'react';
import type { Settings } from '../types';
import uiText from '../data/ui-text.json';
import officialsConfig from '../data/officials.json';
import { useCustomOfficialsStore } from '../store/customOfficialsStore';
import { AppointOfficialPanel } from './AppointOfficialPanel';

// 官员详情弹窗（行内小组件）
function OfficialDetail({ official, onClose }: { official: typeof ALL_OFFICIALS[0]; onClose: () => void }) {
  return (
    <div className="official-detail-overlay" onClick={onClose}>
      <div className="official-detail" onClick={(e) => e.stopPropagation()}>
        <div className="official-detail__header">
          <span className="official-detail__rank">{official.rank}品</span>
          <span className="official-detail__title">{official.title}</span>
          <button className="official-detail__close btn btn--ghost" onClick={onClose}>✕</button>
        </div>
        <div className="official-detail__body">
          <div className="official-detail__row">
            <span className="official-detail__label">姓名</span>
            <span className="official-detail__value">{official.name}</span>
          </div>
          <div className="official-detail__row">
            <span className="official-detail__label">派系</span>
            <span className="official-detail__value">{official.faction}</span>
          </div>
          {official.isChancellor && (
            <div className="official-detail__row">
              <span className="official-detail__label">特殊职责</span>
              <span className="official-detail__value">朝会结束后做总结陈词</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface Props {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

const ALL_OFFICIALS = Object.values(officialsConfig.officials);

const PROVIDERS = ['deepseek', 'gemini', 'glm4', 'openai', 'custom'] as const;

export function SettingsPanel({ settings, onUpdate, onClose }: Props) {
  const [aiExpanded, setAiExpanded] = useState(false);
  const [detailOfficial, setDetailOfficial] = useState<typeof ALL_OFFICIALS[0] | null>(null);
  const [showAppoint, setShowAppoint] = useState(false);

  const { customOfficials, loadCustomOfficials, removeCustomOfficial } = useCustomOfficialsStore();

  // 加载 IndexedDB 中的自定义官员
  useEffect(() => {
    loadCustomOfficials();
  }, []);

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
    <>
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
              {/* 预置官员列表 */}
              {ALL_OFFICIALS.map((o) => (
                <div key={o.id} className="official-checkbox">
                  <label className="official-checkbox__left">
                    <input
                      type="checkbox"
                      checked={settings.selectedOfficials.includes(o.id)}
                      onChange={() => toggleOfficial(o.id)}
                    />
                    <span className="official-checkbox__rank">{o.rank}品</span>
                    <span className="official-checkbox__title">{o.title}</span>
                  </label>
                  <button
                    className="official-checkbox__detail btn btn--ghost btn--xs"
                    onClick={() => setDetailOfficial(o)}
                    type="button"
                  >
                    详情
                  </button>
                </div>
              ))}

              {/* 自定义官员列表（如有） */}
              {customOfficials.map((o) => (
                <div key={o.id} className="official-checkbox">
                  <label className="official-checkbox__left">
                    <input
                      type="checkbox"
                      checked={settings.selectedOfficials.includes(o.id)}
                      onChange={() => toggleOfficial(o.id)}
                    />
                    <span className="official-checkbox__rank">{o.rank}品</span>
                    <span className="official-checkbox__title">{o.title}</span>
                  </label>
                  <button
                    className="btn btn--xs btn--ghost"
                    onClick={() => removeCustomOfficial(o.id)}
                    type="button"
                  >
                    撤职
                  </button>
                </div>
              ))}

              {/* 封官按钮 */}
              <button
                className="btn btn--secondary btn--sm"
                disabled={customOfficials.length >= 5}
                onClick={() => setShowAppoint(true)}
                type="button"
              >
                {customOfficials.length >= 5 ? '已达上限（5/5）' : '＋ 封官'}
              </button>
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

      {/* 官员详情弹窗 */}
      {detailOfficial && (
        <OfficialDetail
          official={detailOfficial}
          onClose={() => setDetailOfficial(null)}
        />
      )}

      {/* 封官弹窗 */}
      {showAppoint && (
        <AppointOfficialPanel onClose={() => setShowAppoint(false)} />
      )}
    </>
  );
}
