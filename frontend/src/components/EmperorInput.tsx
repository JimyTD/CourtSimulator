import { useState } from 'react';
import uiText from '../data/ui-text.json';

interface Props {
  onSubmit: (topic: string) => void;
  disabled?: boolean;
}

export function EmperorInput({ onSubmit, disabled = false }: Props) {
  const [topic, setTopic] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setTopic('');
  }

  return (
    <form className="emperor-input" onSubmit={handleSubmit}>
      <div className="emperor-input__inner">
        <textarea
          className="emperor-input__textarea"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={uiText.emperor.inputPlaceholder}
          disabled={disabled}
          rows={2}
          onKeyDown={(e) => {
            // Ctrl/Cmd + Enter 提交
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
        />
        <button
          type="submit"
          className="emperor-input__submit btn btn--vermilion"
          disabled={disabled || !topic.trim()}
        >
          {uiText.emperor.submitBtn}
        </button>
      </div>
    </form>
  );
}
