interface Props {
  label: string;
  value: string;
  variant?: "ink" | "plain" | "wash";
}

export default function StatCard({ label, value, variant = "plain" }: Props) {
  return (
    <div className={`stat-card stat-card-${variant}`}>
      <p className="microlabel stat-card-label">{label}</p>
      <p className="stat-card-value tnum">{value}</p>
    </div>
  );
}
