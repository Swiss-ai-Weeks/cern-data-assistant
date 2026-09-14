import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";

interface Props {
  hot?: boolean;
  /** Honest HUD — not real DAQ telemetry */
  telemetry?: boolean;
  /** Conceptual detector layer labels */
  labels?: boolean;
  compact?: boolean;
  className?: string;
}

/** Paper-and-ink event display. Two bunches collide; tracks curve like muons. */
export default function CollisionView({
  hot = false,
  telemetry = false,
  labels = false,
  compact = false,
  className,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const count = compact ? 16 : 32;
    const tracks = Array.from({ length: count }, (_, i) => ({
      a: (i / count) * Math.PI * 2 + 0.11,
      curve: ((i % 5) - 2) * 0.22,
      ink: i % 3 !== 0,
      len: 0.38 + (i % 7) * 0.08,
    }));

    let raf = 0;
    const paint = (t: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 8 || h < 8) {
        raf = requestAnimationFrame(paint);
        return;
      }
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.52;

      for (const r of [0.16, 0.28, 0.42, 0.58, 0.74]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, w * r * 0.38, h * r * 0.48, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(19, 20, 16, ${0.05 + r * 0.07})`;
        ctx.lineWidth = r > 0.5 ? 1.4 : 1;
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(63, 99, 201, 0.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.stroke();

      const pulse = reduce ? 0.5 : (t / 1400) % 1;
      const bunch = (x: number) => {
        const g = ctx.createRadialGradient(x, cy, 0, x, cy, 14);
        g.addColorStop(0, "rgba(63, 99, 201, 0.95)");
        g.addColorStop(1, "rgba(63, 99, 201, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, cy, 14, 0, Math.PI * 2);
        ctx.fill();
      };
      bunch(pulse * cx);
      bunch(w - pulse * cx);

      const burst = hot ? 1.05 : 0.72;
      for (const tr of tracks) {
        ctx.beginPath();
        for (let s = 0; s <= 36; s++) {
          const u = (s / 36) * tr.len * burst;
          const spin = reduce ? 0 : t / 9000;
          const ang = tr.a + tr.curve * u * 4 + spin;
          const x = cx + Math.cos(ang) * u * w * 0.4;
          const y = cy + Math.sin(ang) * u * h * 0.5;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = tr.ink ? "rgba(19, 20, 16, 0.42)" : "rgba(63, 99, 201, 0.65)";
        ctx.lineWidth = hot ? 1.7 : 1.15;
        ctx.stroke();
      }

      ctx.fillStyle = hot ? "#131410" : "#3f63c9";
      ctx.beginPath();
      ctx.arc(cx, cy, hot ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();

      if (!reduce) raf = requestAnimationFrame(paint);
    };

    paint(0);
    return () => cancelAnimationFrame(raf);
  }, [hot, compact]);

  return (
    <div className={cn("collision-wrap", compact && "collision-compact", className)}>
      <canvas ref={ref} className="collision" aria-hidden />
      {telemetry && (
        <div className="collision-hud" aria-hidden>
          <span>B× illustrative</span>
          <span className="hud-pulse">{hot ? "beam on" : "standby"}</span>
          <span>tracks · conceptual</span>
        </div>
      )}
      {labels && (
        <div className="collision-labels" aria-hidden>
          <span className="lbl-tracker">Tracker</span>
          <span className="lbl-ecal">ECAL</span>
          <span className="lbl-muon">Muon sys.</span>
          <span className="lbl-solenoid">Solenoid B</span>
        </div>
      )}
    </div>
  );
}
