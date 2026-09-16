import { useEffect, useState } from "react";
import { checkHealth } from "./api";
import type { HealthResponse } from "./types";
import Chat from "./components/Chat";
import HelpSheet from "./components/HelpSheet";
import TrustFlow from "./components/TrustFlow";
import SystemBanner from "./components/ui/SystemBanner";

export default function App() {
  // undefined = first check in progress; null = a completed check failed.
  const [health, setHealth] = useState<HealthResponse | null | undefined>(undefined);
  const [trustOpen, setTrustOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        setTrustOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <SystemBanner health={health} />
      <Chat
        health={health ?? null}
        helpOpen={helpOpen}
        onOpenHelp={() => {
          setHelpOpen(true);
          setTrustOpen(false);
        }}
        onCloseHelp={() => setHelpOpen(false)}
        onOpenTrust={() => {
          setTrustOpen(true);
          setHelpOpen(false);
        }}
      />
      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
      <TrustFlow open={trustOpen} onClose={() => setTrustOpen(false)} />
    </>
  );
}
