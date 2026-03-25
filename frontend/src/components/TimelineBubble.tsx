import type { TimelineMessage } from '../types';
import uiText from '../data/ui-text.json';

interface Props {
  message: TimelineMessage;
}

const CURSOR_CHAR = '▏';

export function TimelineBubble({ message }: Props) {
  const { type, officialTitle, rank, content, isStreaming } = message;

  // 轮次分隔符
  if (type === 'round_start') {
    return (
      <div className="tl-round-divider">
        <span className="tl-round-divider__line" />
        <span className="tl-round-divider__text">
          {uiText.round.label.replace('{n}', String(message.round))}
        </span>
        <span className="tl-round-divider__line" />
      </div>
    );
  }

  // thinking 状态
  if (type === 'thinking') {
    return (
      <div className="tl-bubble tl-bubble--thinking">
        <div className="tl-bubble__badge">
          {rank != null && <span className="tl-bubble__rank">{rank}品</span>}
          <span className="tl-bubble__title">{officialTitle}</span>
        </div>
        <div className="tl-bubble__body">
          <span className="tl-bubble__thinking-dots">{uiText.status.thinking}</span>
        </div>
      </div>
    );
  }

  // silent 状态
  if (type === 'silent') {
    return (
      <div className="tl-bubble tl-bubble--silent">
        <div className="tl-bubble__badge">
          {rank != null && <span className="tl-bubble__rank">{rank}品</span>}
          <span className="tl-bubble__title">{officialTitle}</span>
        </div>
        <div className="tl-bubble__body">
          <span className="tl-bubble__silent-text">{uiText.status.silent}</span>
        </div>
      </div>
    );
  }

  // speech 气泡（正常发言 / 流式发言）
  return (
    <div className={`tl-bubble tl-bubble--speech ${isStreaming ? 'tl-bubble--streaming' : ''}`}>
      <div className="tl-bubble__badge">
        {rank != null && <span className="tl-bubble__rank">{rank}品</span>}
        <span className="tl-bubble__title">{officialTitle}</span>
      </div>
      <div className="tl-bubble__body">
        <p className="tl-bubble__content">
          {content}
          {isStreaming && (
            <span className="tl-bubble__cursor" aria-hidden="true">{CURSOR_CHAR}</span>
          )}
        </p>
      </div>
    </div>
  );
}
