# Judge demo — Beamline

Open the deployed app and hard-refresh once. Confirm the status strip says the catalog and model are online and shows 755 sources. Before judging, run `scripts/warm_h100.sh` and `./scripts/judge_demo.sh http://127.0.0.1:5001` on LaunchPad.

Lead with the scientific task: **CERN data is open, but turning it into a result that can be questioned and reproduced still requires files, code, and detector knowledge.** Beamline connects those steps in one evidence trail.

## Three-minute flagship

### 0:00–0:30 — Start with a real result

Click **Open the dimuon lab**.

Say: “This is a deterministic calculation over 500,000 source entries from CMS 2012 open data at 8 TeV. The model does not draw this spectrum.”

Point to the CERN record/DOI, cut flow, selected count, plotted count, overflow, and the visible Z peak around 91 GeV.

### 0:30–1:10 — Challenge the interpretation

Type:

> what does this bump mean?

Say: “A bump is an observation, not automatically a discovery. Beamline retrieves the CERN analysis that documents the feature around 30 GeV as a trigger effect and keeps that literature claim separate from our calculation.”

Open the citation. Point out the grounded status and source match; do not describe the match score as scientific confidence.

### 1:10–1:45 — Change the analysis conversationally

Type:

> make both muons harder

The minimum pT changes to 10 GeV, the real sample recomputes, and the original remains as a dashed line. Point to the exact event delta. Then type:

> compare with the original

If useful, type `undo that change` to restore the preceding run.

### 1:45–2:20 — Go from plot to source entry

Choose the **30–31 GeV** bin. Open one of the eight shown entries.

Say: “These are measured pT, eta, phi, charge, and reconstructed pair mass from the selected source entry. The rings are a schematic projection, clearly labeled as such. The reduced format does not contain raw detector hits or full event identifiers, so Beamline does not invent them.”

### 2:20–2:50 — Take the evidence home

Click **Export reproducible investigation**.

Say: “The ZIP contains the bounded sample, exact canonical recipe, analysis parameters, result, histogram CSV, sources, notebook, dependency pins, provenance, and SHA-256 checksums. Its replay must reproduce the same count.”

### 2:50–3:00 — Close

“Beamline makes CERN data something a newcomer can investigate, question, and reproduce.”

## Challenge-coverage follow-up

Return to Beamline and ask:

> proton-proton collisions at 13 TeV with muons

Show that the live CERN catalog returns records at the requested energy. The guided lab remains explicitly 8 TeV and refuses to silently substitute it for a 13 TeV request.

Then ask:

> Why does CMS use a solenoid?

Open a cited CERN source. For the guardrail demonstration, ask `How do black holes evaporate?` and show that Beamline refuses when its CERN corpus does not support the answer.

## Recovery

| Symptom | Action |
| --- | --- |
| Browser cannot connect | Reopen the SSH tunnel to remote port 5001 and refresh |
| Model is cold | Run `scripts/warm_h100.sh`; the numeric investigation remains independent of the model |
| Explanation is slow | Continue with selection changes and entry inspection, then return to the answer |
| CERN catalog is unavailable | Use the already-staged authentic investigation and disclose the catalog outage |
| Page refreshed | Reopen the dimuon lab; the current runs return from browser session storage |
| Need a complete proof | Run `scripts/judge_demo.sh http://127.0.0.1:5001` on LaunchPad |

Never call the bounded first-entry sample representative of all CMS data. Never claim the selection change proves the trigger cause or that the plot establishes a new particle.
