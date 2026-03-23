import { useState } from 'react';
import uiText from '../data/ui-text.json';

interface Props {
  onDecree: (decree: string) => void;
  disabled?: boolean;
}

export function ImperialDecree({ onDecree, disabled = false }: Props) {
  const [decree, setDecree] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = decree.trim();
    if (!trimmed) return;
    onDecree(trimmed);
    setDecree('');
  }

  return (
    <div className="imperial-decree">
      <div className="imperial-decree__label">{uiText.emperor.decreeLabel}</div>
      <form className="imperial-decree__form" onSubmit={handleSubmit}>
        <textarea
          className="imperial-decree__textarea"
          value={decree}
          onChange={(e) => setDecree(e.target.value)}
          placeholder={uiText.emperor.decreePlaceholder}
          disabled={disabled}
          rows={3}
        />
        <button
          type="submit"
          className="imperial-decree__submit btn btn--gold"
          disabled={disabled || !decree.trim()}
        >
          {uiText.emperor.decreeSubmit}
        </button>
      </form>
    </div>
  );
}
