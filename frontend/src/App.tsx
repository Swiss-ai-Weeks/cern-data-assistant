import { useEffect, useState } from "react";
import { checkHealth } from "./api";
import type { HealthResponse } from "./types";
import StatusBar from "./components/StatusBar";
import Chat from "./components/Chat";

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
    <div className="cockpit">
      <header className="topbar">
        <div className="brand">
          <div className="beam-track" aria-hidden>
            <span className="beam-pulse" />
          </div>
          <div>
            <div className="brand-name">Beamline</div>
            <div className="brand-sub">CERN Data Assistant</div>
          </div>
        </div>
        <StatusBar health={health} />
      </header>
      <Chat />
    </div>
  );
}
