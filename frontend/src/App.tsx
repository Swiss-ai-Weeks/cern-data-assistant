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
    <div className="app-shell product">
      <header className="app-header">
        <div>
          <p className="brand-kicker">NVIDIA LaunchPad · CERN Open Data</p>
          <h1 className="app-title">Beamline</h1>
          <p className="app-subtitle">
            The research assistant for LHC open data — search datasets, inspect
            files, and ask about detectors. Ungrounded physics is refused.
          </p>
        </div>
        <StatusBar health={health} />
      </header>
      <Chat />
    </div>
  );
}
