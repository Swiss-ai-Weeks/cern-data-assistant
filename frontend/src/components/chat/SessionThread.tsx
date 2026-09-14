export type ThreadItem = {
  userId: string;
  asstId: string | null;
  label: string;
};

interface Props {
  items: ThreadItem[];
  activeAsstId: string | null;
  onSelect: (asstId: string) => void;
}

export default function SessionThread({ items, activeAsstId, onSelect }: Props) {
  if (items.length <= 1) return null;

  return (
    <nav className="session-thread" aria-label="Questions in this session">
      <p className="microlabel session-thread-label">This session</p>
      <div className="session-thread-row">
        {items.map((item) => {
          const active = item.asstId !== null && item.asstId === activeAsstId;
          return (
            <button
              key={item.userId}
              type="button"
              className={`session-thread-chip ${active ? "session-thread-chip-active" : ""}`}
              disabled={!item.asstId}
              title={item.label}
              onClick={() => item.asstId && onSelect(item.asstId)}
            >
              {item.label.length > 56 ? `${item.label.slice(0, 56)}…` : item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
