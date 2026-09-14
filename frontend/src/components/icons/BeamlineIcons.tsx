type IconProps = { className?: string };

export function HomeIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path strokeLinejoin="round" d="M5 10.5L12 4l7 6.5V19a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 19v-8.5z" />
      <path strokeLinecap="round" d="M10 20.5V14h4v6.5" />
    </svg>
  );
}

export function FilePlusIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path strokeLinejoin="round" d="M8 4h6l4 4v12a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5.5A1.5 1.5 0 0 1 8 4z" />
      <path strokeLinecap="round" d="M14 4v4h4M12 11v4M10 13h4" />
    </svg>
  );
}

export function GridIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </svg>
  );
}

export function DatasetIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

export function EvidenceIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path strokeLinecap="round" d="M7 4h7l3 3v13H7z" />
      <path strokeLinecap="round" d="M14 4v4h4M9 12h6M9 16h4" />
    </svg>
  );
}

export function ShieldIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path strokeLinejoin="round" d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
    </svg>
  );
}

export function HistoryIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path strokeLinecap="round" d="M12 8v4l3 2" />
    </svg>
  );
}

export function PlusIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function StatusIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2" />
    </svg>
  );
}

export function HelpIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path strokeLinecap="round" d="M9.5 9.25a2.75 2.75 0 0 1 5 1.5c0 1.75-2.75 2-2.75 3.25" />
      <circle cx="12" cy="16.75" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SearchIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path strokeLinecap="round" d="M16 16l5 5" />
    </svg>
  );
}
