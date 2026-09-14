import { useEffect, type RefObject } from "react";

/** Focus close control and handle Escape for modal drawers (UI UX Pro Max a11y). */
export function useOverlayA11y(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const close =
      panelRef.current?.querySelector<HTMLElement>(".drawer-close") ??
      panelRef.current?.querySelector<HTMLElement>("button");
    close?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose, panelRef]);
}
