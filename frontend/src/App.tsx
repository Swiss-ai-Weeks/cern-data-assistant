import { useEffect, useState } from "react";
import { checkHealth } from "./api";
import type { HealthResponse } from "./types";
import StatusBar from "./components/StatusBar";
import Chat from "./components/Chat";
import LogoMark from "./components/LogoMark";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

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
    <div className="app">
      <div className="grain" aria-hidden />
      <aside className="rail">
        <LogoMark />
        <span className="rail-dot" title="live" />
      </aside>
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-name">beamline</span>
          </div>
          <StatusBar health={health} />
        </header>
        <Chat />
      </div>
    </div>
  );
}
