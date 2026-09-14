import type { ReactNode } from "react";

interface Props {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  dark?: boolean;
}

export default function Panel({ title, action, className = "", children, dark }: Props) {
  return (
    <section className={`ui-panel ${dark ? "ui-panel-dark" : ""} ${className}`}>
      {(title || action) && (
        <div className="ui-panel-head">
          {title && <p className="microlabel">{title}</p>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
