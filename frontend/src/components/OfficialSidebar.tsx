import type { OfficialState } from '../types';

interface Props {
  officials: OfficialState[];
}

const STATUS_ICONS: Record<string, string> = {
  waiting: '⏳',
  thinking: '💭',
  streaming: '🖊️',
  done: '✅',
  silent: '🤐',
};

export function OfficialSidebar({ officials }: Props) {
  // 按品级排序（丞相排最后）
  const sorted = [...officials].sort((a, b) => {
    if (a.official.isChancellor) return 1;
    if (b.official.isChancellor) return -1;
    return a.official.rank - b.official.rank;
  });

  return (
    <aside className="official-sidebar">
      {sorted.map((os) => (
        <div
          key={os.official.id}
          className={`official-sidebar__item official-sidebar__item--${os.status}`}
          title={`${os.official.title}（${os.official.rank}品）- ${os.status}`}
        >
          <span className="official-sidebar__icon">
            {STATUS_ICONS[os.status] || '⏳'}
          </span>
          <span className="official-sidebar__name">{os.official.title}</span>
        </div>
      ))}
    </aside>
  );
}
