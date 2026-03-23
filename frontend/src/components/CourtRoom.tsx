import { useState, useEffect } from 'react';
import { OfficialCard } from './OfficialCard';
import { EmperorInput } from './EmperorInput';
import { ImperialDecree } from './ImperialDecree';
import { ChancellorSummary } from './ChancellorSummary';
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

  // 初始化时加载历史记录
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const isRunning = debateState.status === 'running';
  const isComplete = debateState.status === 'complete';

  // 官员列表（按品级排序，丞相排最后）
  const officialEntries = Object.values(debateState.officials).sort((a, b) => {
    if (a.official.isChancellor) return 1;
    if (b.official.isChancellor) return -1;
    return a.official.rank - b.official.rank;
  });

  // 非丞相官员（展示在主区域）
  const mainOfficials = officialEntries.filter((o) => !o.official.isChancellor);
  // 丞相（如果存在，在总结区单独展示）
  const chancellor = officialEntries.find((o) => o.official.isChancellor);

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
            onSubmit={(topic) => startDebate(topic, settings)}
            disabled={isRunning}
          />
        </div>
      )}

      {/* ── 朝堂主区域 ── */}
      {officialEntries.length > 0 && (
        <main className="court-room__main">
          <div className="court-room__officials-grid">
            {mainOfficials.map((os) => (
              <OfficialCard
                key={os.official.id}
                officialState={os}
                typingSpeed={settings.typingSpeed}
              />
            ))}
          </div>

          {/* 丞相独占一行（若参与） */}
          {chancellor && (
            <div className="court-room__chancellor-row">
              <OfficialCard
                officialState={chancellor}
                typingSpeed={settings.typingSpeed}
              />
            </div>
          )}
        </main>
      )}

      {/* ── 丞相总结 ── */}
      {(debateState.chancellorSummary || isComplete) && (
        <ChancellorSummary
          content={debateState.chancellorSummary}
          typingSpeed={settings.typingSpeed}
        />
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

      {/* ── 运行中：显示再次输入按钮 ── */}
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
