import { useState } from 'react';
import { useHistoryStore } from '../store/historyStore';
import type { DebateRecord } from '../store/historyStore';

interface HistoryPanelProps {
  onClose: () => void;
}

/** 格式化时间：MM-DD HH:mm */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${min}`;
}

/** 官员标签，最多显示 3 个，多余显示 "+N" */
function OfficialTags({ officials }: { officials: string[] }) {
  const shown = officials.slice(0, 3);
  const extra = officials.length - 3;
  return (
    <span className="history-record__officials">
      {shown.map((t, i) => (
        <span key={i} className="history-record__official-tag">{t}</span>
      ))}
      {extra > 0 && <span className="history-record__official-tag history-record__official-tag--more">+{extra}</span>}
    </span>
  );
}

/** 按轮次分组发言 */
function SpeechesByRound({ record }: { record: DebateRecord }) {
  const rounds: Record<number, typeof record.speeches> = {};
  for (const s of record.speeches) {
    if (!rounds[s.round]) rounds[s.round] = [];
    rounds[s.round].push(s);
  }
  const roundNums = Object.keys(rounds)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="history-record__detail">
      {roundNums.map((r) => (
        <div key={r} className="history-record__round-group">
          <div className="history-record__round-label">第 {r} 轮</div>
          {rounds[r].map((s, i) => (
            <div key={i} className="history-record__speech">
              <span className="history-record__speech-title">{s.officialTitle}：</span>
              <span className="history-record__speech-content">{s.content}</span>
            </div>
          ))}
        </div>
      ))}
      {record.chancellorSummary && (
        <div className="history-record__round-group">
          <div className="history-record__round-label">内阁首辅总结</div>
          <div className="history-record__speech">
            <span className="history-record__speech-content">{record.chancellorSummary}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function HistoryPanel({ onClose }: HistoryPanelProps) {
  const { records, clearHistory } = useHistoryStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleClear() {
    await clearHistory();
    setConfirmClear(false);
    setExpandedId(null);
  }

  return (
    <>
      {/* 遮罩层 */}
      <div className="history-panel-overlay" onClick={onClose} />

      {/* 抽屉面板 */}
      <div className="history-panel">
        {/* 头部 */}
        <div className="history-panel__header">
          <h2 className="history-panel__title">朝会记录</h2>
          <div className="history-panel__header-actions">
            {records.length > 0 && !confirmClear && (
              <button
                className="btn btn--ghost history-panel__clear-btn"
                onClick={() => setConfirmClear(true)}
              >
                清空历史
              </button>
            )}
            {confirmClear && (
              <span className="history-panel__confirm">
                <span>确认清空？</span>
                <button className="btn btn--vermilion" onClick={handleClear}>确认</button>
                <button className="btn btn--ghost" onClick={() => setConfirmClear(false)}>取消</button>
              </span>
            )}
            <button className="btn btn--ghost history-panel__close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* 记录列表 */}
        <div className="history-panel__body">
          {records.length === 0 ? (
            <div className="history-panel__empty">尚无朝会记录</div>
          ) : (
            records.map((r) => (
              <div
                key={r.id}
                className={`history-record${expandedId === r.id ? ' history-record--expanded' : ''}`}
                onClick={() => toggleExpand(r.id)}
              >
                <div className="history-record__summary">
                  <div className="history-record__topic">「{r.topic}」</div>
                  <div className="history-record__meta">
                    <span className="history-record__time">{formatTime(r.createdAt)}</span>
                    <span className="history-record__rounds">共 {r.rounds} 轮</span>
                    <OfficialTags officials={r.officials} />
                  </div>
                </div>

                {expandedId === r.id && <SpeechesByRound record={r} />}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
