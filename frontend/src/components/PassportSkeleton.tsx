/** Loading placeholder aligned with Beamline cards */
export default function PassportSkeleton() {
  return (
    <div className="beamline-loading-card" aria-busy="true" aria-label="Loading research passport">
      <span className="beamline-progress-spinner" aria-hidden />
      <p className="beamline-loading-caption">Opening the best CERN record…</p>
    </div>
  );
}
