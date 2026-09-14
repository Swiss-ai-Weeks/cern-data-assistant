import { useEffect, useRef, useState } from "react";

const EXIT_MS = 300;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Keep a node mounted through its exit animation. */
export function usePresence(open: boolean, durationMs = EXIT_MS) {
  const [mounted, setMounted] = useState(open);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      setMounted(true);
      return;
    }
    if (!wasOpen.current) return;
    if (prefersReducedMotion()) {
      wasOpen.current = false;
      setMounted(false);
      return;
    }
    const id = window.setTimeout(() => {
      wasOpen.current = false;
      setMounted(false);
    }, durationMs);
    return () => window.clearTimeout(id);
  }, [open, durationMs]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  return {
    shown: open || mounted,
    motion: (open ? "enter" : "exit") as "enter" | "exit",
  };
}
