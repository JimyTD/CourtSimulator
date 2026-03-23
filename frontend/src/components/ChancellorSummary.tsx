import { useEffect, useRef, useState } from 'react';
import uiText from '../data/ui-text.json';

interface Props {
  content: string | null;
  typingSpeed: 'fast' | 'slow';
}

export function ChancellorSummary({ content, typingSpeed }: Props) {
  const [displayText, setDisplayText] = useState('');
  const prevContentRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const msPerChar = typingSpeed === 'fast' ? 30 : 80;

  useEffect(() => {
    if (!content || content === prevContentRef.current) return;
    prevContentRef.current = content;

    let i = 0;
    setDisplayText('');

    function tick() {
      i++;
      setDisplayText(content!.slice(0, i));
      if (i < content!.length) {
        timerRef.current = setTimeout(tick, msPerChar);
      }
    }

    timerRef.current = setTimeout(tick, msPerChar);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, msPerChar]);

  if (!content && !displayText) return null;

  return (
    <div className="chancellor-summary">
      <div className="chancellor-summary__title">{uiText.chancellor.title}</div>
      <p className="chancellor-summary__content">
        {displayText || (
          <span className="chancellor-summary__loading">{uiText.chancellor.loading}</span>
        )}
      </p>
    </div>
  );
}
