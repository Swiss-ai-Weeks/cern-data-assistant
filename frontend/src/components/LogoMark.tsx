interface Props {
  className?: string;
  inverted?: boolean;
}

export default function LogoMark({ className = "logo-mark", inverted = false }: Props) {
  const face = inverted ? "var(--paper)" : "var(--ink-scholarly)";
  const bar = inverted ? "var(--ink-scholarly)" : "var(--paper)";
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill={face} />
      <rect x="7" y="11" width="18" height="3" rx="1.5" fill={bar} />
      <rect x="7" y="18" width="11" height="3" rx="1.5" fill={bar} opacity="0.72" />
    </svg>
  );
}
