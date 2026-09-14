interface Props {
  className?: string;
  inverted?: boolean;
}

/** Rounded mark in the same family as folio: a face, two bars. */
export default function LogoMark({ className = "logo-mark", inverted = false }: Props) {
  const face = inverted ? "var(--paper)" : "var(--ink)";
  const bar = inverted ? "var(--ink)" : "var(--paper)";
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill={face} />
      <rect x="7" y="14" width="18" height="4" rx="2" fill={bar} />
    </svg>
  );
}
