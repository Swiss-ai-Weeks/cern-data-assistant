/** Loading placeholder aligned with Beamline cards */
export default function PassportSkeleton() {
  return (
    <div className="beamline-loading-card" aria-busy="true" aria-label="Loading research passport">
      <div className="beamline-loading-lines">
        <span className="beamline-loading-line w-short" />
        <span className="beamline-loading-line w-long" />
        <span className="beamline-loading-line w-mid" />
      </div>
      <p className="beamline-loading-caption microlabel">Pulling catalog record…</p>
    </div>
  );
}
