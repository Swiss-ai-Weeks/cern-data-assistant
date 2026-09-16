export type DataAdapter = {
  record_id: string;
  title: string;
  energy_tev: number;
  status: "executable" | "catalog_only" | string;
  quality_note?: string;
  record_url?: string;
};

export default function AdapterCapabilityBand({ adapters }: { adapters: DataAdapter[] }) {
  if (!adapters.length) return null;
  return (
    <section className="iv-adapters" aria-label="Supported data adapters">
      <p className="iv-eyebrow">DATA ADAPTERS</p>
      <div className="iv-adapter-grid">
        {adapters.map((adapter) => (
          <article
            key={adapter.record_id}
            className={`iv-adapter-card iv-adapter-${adapter.status}`}
          >
            <header>
              <strong>{adapter.title}</strong>
              <span className="iv-adapter-badge">{adapter.status === "executable" ? "Runnable" : "Catalog only"}</span>
            </header>
            <p className="iv-caption">
              Record {adapter.record_id} · {adapter.energy_tev} TeV
            </p>
            {adapter.quality_note && <p className="iv-caption">{adapter.quality_note}</p>}
            {adapter.record_url && (
              <a href={adapter.record_url} target="_blank" rel="noreferrer">
                Open CERN record ↗
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
