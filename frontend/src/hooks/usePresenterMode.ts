import { useCallback, useEffect, useState } from "react";

export function usePresenterMode() {
  const [on, setOn] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);

  const toggle = useCallback(() => setOn((v) => !v), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setTrustOpen((v) => !v);
        return;
      }
      if (!(e.shiftKey && e.key.toLowerCase() === "p")) return;
      e.preventDefault();
      toggle();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return { presenterOn: on, togglePresenter: toggle, trustOpen, setTrustOpen };
}
