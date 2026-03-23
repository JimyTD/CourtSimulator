import { useEffect, useRef, useState } from 'react';
import type { OfficialState } from '../types';
import uiText from '../data/ui-text.json';

interface Props {
  officialState: OfficialState;
  typingSpeed: 'fast' | 'slow';
}

const CURSOR_CHAR = '|';

export function OfficialCard({ officialState, typingSpeed }: Props) {
  const { official, status, speeches } = officialState;
  const latestSpeech = speeches[speeches.length - 1];

  const [displayText, setDisplayText] = useState('');
  const [cursorVisible, setCursorVisible] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const animFrameRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevContentRef = useRef<string>('');

  const msPerChar = typingSpeed === 'fast' ? 30 : 80;

  // 打字机动画
  useEffect(() => {
    if (status !== 'speaking' || !latestSpeech) return;
    const content = latestSpeech.content;
    if (content === prevContentRef.current) return;
    prevContentRef.current = content;

    let i = 0;
    setDisplayText('');
    setIsTyping(true);
    setCursorVisible(true);

    function tick() {
      i++;
      setDisplayText(content.slice(0, i));
      if (i < content.length) {
        animFrameRef.current = setTimeout(tick, msPerChar);
      } else {
        setIsTyping(false);
      }
    }

    animFrameRef.current = setTimeout(tick, msPerChar);
    return () => {
      if (animFrameRef.current) clearTimeout(animFrameRef.current);
    };
  }, [status, latestSpeech, msPerChar]);

  // 光标闪烁（打字中常亮，打字完成后闪烁 3 次再消失）
  useEffect(() => {
    if (status === 'speaking') {
      setCursorVisible(true);
      return;
    }
    if (status === 'done') {
      let count = 0;
      const id = setInterval(() => {
        setCursorVisible((v) => !v);
        count++;
        if (count >= 6) {
          clearInterval(id);
          setCursorVisible(false);
        }
      }, 400);
      return () => clearInterval(id);
    }
    setCursorVisible(false);
  }, [status]);

  // 非 speaking 状态时直接显示最后一次发言（done）
  useEffect(() => {
    if (status === 'done' && latestSpeech && !isTyping) {
      setDisplayText(latestSpeech.content);
    }
  }, [status, latestSpeech, isTyping]);

  const isSilent = status === 'silent';
  const isThinking = status === 'thinking';
  const isWaiting = status === 'waiting';

  const rankLabel = `${official.rank}品`;

  return (
    <div
      className={`official-card official-card--${status}`}
      data-rank={official.rank}
    >
      <div className="official-card__header">
        <span className="official-card__rank">{rankLabel}</span>
        <span className="official-card__name">{official.name}</span>
        <span className="official-card__title">{official.title}</span>
      </div>

      <div className="official-card__body">
        {isWaiting && (
          <span className="official-card__status-text official-card__status-text--muted">
            {uiText.status.waiting}
          </span>
        )}

        {isThinking && (
          <span className="official-card__status-text official-card__status-text--thinking">
            {uiText.status.thinking}
          </span>
        )}

        {isSilent && (
          <span className="official-card__status-text official-card__status-text--silent">
            {uiText.status.silent}
          </span>
        )}

        {(status === 'speaking' || status === 'done') && (
          <p className="official-card__speech">
            {displayText}
            {cursorVisible && (
              <span className="official-card__cursor" aria-hidden="true">
                {CURSOR_CHAR}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
