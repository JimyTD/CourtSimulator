import { useState } from 'react';
import { useOfficialsStore } from '../store/officialsStore';

interface Props {
  onClose: () => void;
}

interface FormValues {
  title: string;
  name: string;
  rank: number;
  personality: string;
}

const INITIAL_FORM: FormValues = {
  title: '',
  name: '',
  rank: 2,
  personality: '',
};

export function AppointOfficialPanel({ onClose }: Props) {
  const { officials, addCustomOfficial, restorePresets } = useOfficialsStore();
  const customCount = officials.filter((o) => !o.isDefault).length;

  const [form, setForm] = useState<FormValues>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const isFull = customCount >= 5;

  // 检查是否有预设官员被撤职（即可以恢复）
  const hasRemovedPresets = (() => {
    const presetIds = ['hubu', 'bingbu', 'libu', 'gongbu', 'yushi', 'hanlin', 'chancellor'];
    const currentIds = new Set(officials.map((o) => o.id));
    return presetIds.some((id) => !currentIds.has(id));
  })();

  function validate(): boolean {
    const errs: Partial<Record<keyof FormValues, string>> = {};
    if (!form.title.trim()) errs.title = '请填写职位名称';
    if (!form.name.trim()) errs.name = '请填写姓名';
    if (!form.personality.trim()) {
      errs.personality = '请填写性格描述';
    } else if (form.personality.trim().length < 10) {
      errs.personality = '性格描述至少 10 字';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (isFull) return;

    setSubmitting(true);
    try {
      await addCustomOfficial({
        title: form.title.trim(),
        name: form.name.trim(),
        rank: form.rank,
        personality: form.personality.trim(),
      });
      onClose();
    } catch (err) {
      setErrors({ personality: String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      await restorePresets();
    } finally {
      setRestoring(false);
    }
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="appoint-overlay" onClick={handleOverlayClick}>
      <div className="appoint-panel" onClick={(e) => e.stopPropagation()}>
        {/* 标题行 */}
        <div className="appoint-panel__header">
          <span className="appoint-panel__title">封官</span>
          <button className="btn btn--ghost appoint-panel__close" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        {/* 恢复预设按钮（有被撤的预设时显示） */}
        {hasRemovedPresets && (
          <button
            type="button"
            className="btn btn--ghost btn--sm appoint-panel__restore"
            onClick={handleRestore}
            disabled={restoring}
          >
            {restoring ? '恢复中…' : '↩ 恢复预设官员'}
          </button>
        )}

        {/* 表单 */}
        <form className="appoint-panel__form" onSubmit={handleSubmit} noValidate>
          {/* 职位名称 */}
          <div className="appoint-field">
            <label className="appoint-field__label">职位名称</label>
            <input
              type="text"
              className={`appoint-field__input${errors.title ? ' appoint-field__input--error' : ''}`}
              placeholder="如：吏部尚书"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={20}
            />
            {errors.title && <span className="appoint-field__error">{errors.title}</span>}
          </div>

          {/* 姓名 */}
          <div className="appoint-field">
            <label className="appoint-field__label">姓名</label>
            <input
              type="text"
              className={`appoint-field__input${errors.name ? ' appoint-field__input--error' : ''}`}
              placeholder="如：魏征"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              maxLength={10}
            />
            {errors.name && <span className="appoint-field__error">{errors.name}</span>}
          </div>

          {/* 品级 */}
          <div className="appoint-field">
            <label className="appoint-field__label">品级</label>
            <select
              className="appoint-field__select"
              value={form.rank}
              onChange={(e) => setForm((f) => ({ ...f, rank: Number(e.target.value) }))}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => (
                <option key={r} value={r}>
                  {r} 品
                </option>
              ))}
            </select>
          </div>

          {/* 性格描述 */}
          <div className="appoint-field">
            <label className="appoint-field__label">性格描述</label>
            <textarea
              className={`appoint-field__textarea${errors.personality ? ' appoint-field__input--error' : ''}`}
              placeholder="如：铁面无私，凡事按规矩来，不讲情面"
              value={form.personality}
              onChange={(e) => setForm((f) => ({ ...f, personality: e.target.value }))}
              rows={3}
              maxLength={200}
            />
            <span className="appoint-field__hint">
              {form.personality.length}/200（至少 10 字）
            </span>
            {errors.personality && (
              <span className="appoint-field__error">{errors.personality}</span>
            )}
          </div>

          {/* 底部按钮 */}
          <div className="appoint-panel__actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn btn--vermilion btn--sm"
              disabled={isFull || submitting}
            >
              {isFull ? '已达上限（5/5）' : submitting ? '封官中…' : '确认封官'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
