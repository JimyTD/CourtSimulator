import { useEffect, useRef } from 'react';
import { TimelineBubble } from './TimelineBubble';
import { ChancellorSummary } from './ChancellorSummary';
import type { TimelineMessage } from '../types';

interface Props {
  timeline: TimelineMessage[];
  chancellorSummary: string | null;
  isComplete: boolean;
  typingSpeed: 'fast' | 'slow';
}

export function DebateTimeline({ timeline, chancellorSummary, isComplete, typingSpeed }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部（有新消息时）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 仅当用户没有手动向上滚动时才自动滚动
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 120;

    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [timeline.length, timeline[timeline.length - 1]?.content]);

  return (
    <div className="debate-timeline" ref={containerRef}>
      <div className="debate-timeline__messages">
        {timeline.map((msg) => (
          <TimelineBubble key={msg.id} message={msg} />
        ))}

        {/* 丞相总结（朝会结束后） */}
        {(chancellorSummary || isComplete) && (
          <ChancellorSummary content={chancellorSummary} typingSpeed={typingSpeed} />
        )}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
