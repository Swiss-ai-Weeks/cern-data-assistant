import type { InvestigationClaim } from "../../lib/investigationApi";

const toneClass: Record<string, string> = {
  calculated: "claim-calculated",
  documented: "claim-documented",
  interpretation: "claim-interpretation",
  not_established: "claim-not-established",
};

export default function InvestigationClaims({ claims }: { claims: InvestigationClaim[] }) {
  if (!claims.length) return null;
  return (
    <section className="iv-claims" aria-label="Structured evidence claims">
      <p className="iv-eyebrow">CLAIMS · LINKED TO DATA</p>
      <ul className="iv-claims-list">
        {claims.map((claim) => (
          <li key={claim.id} className={toneClass[claim.evidence_label] ?? ""}>
            <span className="iv-claim-label">{claim.label}</span>
            <p>{claim.statement}</p>
            {claim.excerpt && <blockquote>{claim.excerpt}</blockquote>}
            {claim.resolved_refs && claim.resolved_refs.length > 0 && (
              <details className="iv-claim-refs">
                <summary>Linked fields ({claim.resolved_refs.length})</summary>
                <ul>
                  {claim.resolved_refs.map((ref, i) => (
                    <li key={`${claim.id}-ref-${i}`}>
                      <code>{ref.kind}</code>
                      {"value" in ref && ref.value != null ? `: ${JSON.stringify(ref.value)}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
