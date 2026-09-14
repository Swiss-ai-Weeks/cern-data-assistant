import { useEffect, useState } from "react";
import { checkHealth } from "./api";
import type { HealthResponse } from "./types";
import Chat from "./components/Chat";
import TrustFlow from "./components/TrustFlow";
import { usePresenterMode } from "./hooks/usePresenterMode";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const { presenterOn, trustOpen, setTrustOpen } = usePresenterMode();

  useEffect(() => {
    let alive = true;
    async function ping() {
      try {
        const h = await checkHealth();
        if (alive) setHealth(h);
      } catch {
        if (alive) setHealth(null);
      }
    }
    ping();
    const id = window.setInterval(ping, 20000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className={presenterOn ? "presenter-mode" : ""}>
      <Chat
        health={health}
        presenterOn={presenterOn}
        onOpenTrust={() => setTrustOpen(true)}
      />
      {presenterOn && (
        <div className="presenter-shortcuts" aria-hidden>
          <kbd>1</kbd> discovery · <kbd>2</kbd> grounded · <kbd>3</kbd> integrity · <kbd>?</kbd> trust
        </div>
      )}
      <TrustFlow open={trustOpen} onClose={() => setTrustOpen(false)} />
    </div>
  );
}
