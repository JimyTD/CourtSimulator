import { useState, useEffect } from 'react';
import { OfficialSidebar } from './OfficialSidebar';
import { DebateTimeline } from './DebateTimeline';
import { EmperorInput } from './EmperorInput';
import { ImperialDecree } from './ImperialDecree';
import { SettingsPanel } from './SettingsPanel';
import { HistoryPanel } from './HistoryPanel';
import { useDebate } from '../hooks/useDebate';
import { useSettings } from '../hooks/useSettings';
import { useDebateStore } from '../store/debateStore';
import { useHistoryStore } from '../store/historyStore';
import uiText from '../data/ui-text.json';

export function CourtRoom() {
  const { startDebate } = useDebate();
  const { settings, updateSettings } = useSettings();
  const debateState = useDebateStore();
  const { loadHistory } = useHistoryStore();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [decree, setDecree] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // 初始化时加载历史记录
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const isRunning = debateState.status === 'running';
  const isComplete = debateState.status === 'complete';
  const hasOfficials = Object.keys(debateState.officials).length > 0;

  // 包裹 startDebate 以捕获 API 错误
  const handleStartDebate = async (topic: string) => {
    setApiError(null);
    try {
      await startDebate(topic, settings);
    } catch (err: any) {
      setApiError(err?.message || '朝会发起失败，请稍后重试');
    }
  };

  // 官员列表（用于侧栏）
  const officialEntries = Object.values(debateState.officials);

  function handleDecree(text: string) {
    setDecree(text);
  }

  return (
    <div className="court-room">
      {/* ── 顶栏 ── */}
      <header className="court-room__header">
        <div className="court-room__title-block">
          <h1 className="court-room__title">{uiText.app.title}</h1>
          <span className="court-room__subtitle">{uiText.app.subtitle}</span>
        </div>
        <div className="court-room__header-actions">
          {isRunning && (
            <span className="court-room__round-badge">
              {uiText.round.label.replace('{n}', String(debateState.currentRound))}
              &nbsp;/&nbsp;
              {uiText.round.of.replace('{total}', String(debateState.totalRounds))}
            </span>
          )}
          <button
            className="btn btn--ghost btn--header-action"
            onClick={() => setHistoryOpen(true)}
          >
            朝会记录
          </button>
          <button
            className="btn btn--ghost btn--header-action"
            onClick={() => setSettingsOpen(true)}
            disabled={isRunning}
          >
            朝堂设置
          </button>
        </div>
      </header>

      {/* ── 议题区 ── */}
      {debateState.topic && (
        <div className="court-room__topic">
          <span className="court-room__topic-label">当前议题</span>
          <span className="court-room__topic-text">「{debateState.topic}」</span>
        </div>
      )}

      {/* ── 皇帝输入（idle 状态显示） ── */}
      {debateState.status === 'idle' && (
        <div className="court-room__input-area">
          <EmperorInput
            onSubmit={(topic) => void handleStartDebate(topic)}
            disabled={isRunning}
          />
          {apiError && (
            <div className="court-room__api-error">
              ⚠️ {apiError}
            </div>
          )}
        </div>
      )}

      {/* ── 朝堂主区域：侧栏 + 时间线 ── */}
      {hasOfficials && (
        <main className="court-room__main">
          {/* 侧栏：桌面端显示 */}
          <OfficialSidebar officials={officialEntries} />

          {/* 手机端：顶部横向滚动栏 */}
          <div className="court-room__mobile-bar">
            {officialEntries
              .sort((a, b) => {
                if (a.official.isChancellor) return 1;
                if (b.official.isChancellor) return -1;
                return a.official.rank - b.official.rank;
              })
              .map((os) => (
                <span
                  key={os.official.id}
                  className={`mobile-bar__chip mobile-bar__chip--${os.status}`}
                  title={os.official.title}
                >
                  {os.official.title.slice(0, 2)}
                </span>
              ))}
          </div>

          {/* 时间线 */}
          <DebateTimeline
            timeline={debateState.timeline}
            chancellorSummary={debateState.chancellorSummary}
            isComplete={isComplete}
            typingSpeed={settings.typingSpeed}
          />
        </main>
      )}

      {/* ── 皇帝御批 ── */}
      {isComplete && !decree && (
        <ImperialDecree onDecree={handleDecree} />
      )}

      {/* ── 御批已下 ── */}
      {decree && (
        <div className="court-room__decree-issued">
          <span className="court-room__decree-label">{uiText.emperor.decreeLabel}</span>
          <p className="court-room__decree-text">「{decree}」</p>
          <button
            className="btn btn--vermilion"
            onClick={() => {
              setDecree(null);
              useDebateStore.getState().resetDebate();
            }}
          >
            退朝，再开一朝
          </button>
        </div>
      )}

      {/* ── 页脚 ── */}
      {(isRunning || isComplete) && !decree && (
        <div className="court-room__footer">
          {isComplete && (
            <button
              className="btn btn--ghost"
              onClick={() => useDebateStore.getState().resetDebate()}
            >
              重开朝会
            </button>
          )}
        </div>
      )}

      {/* ── 设置面板 ── */}
      {settingsOpen && (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <SettingsPanel
              settings={settings}
              onUpdate={updateSettings}
              onClose={() => setSettingsOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ── 历史记录面板 ── */}
      {historyOpen && (
        <HistoryPanel onClose={() => setHistoryOpen(false)} />
      )}
    </div>
  );
}
