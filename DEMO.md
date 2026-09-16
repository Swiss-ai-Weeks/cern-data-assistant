# Beamline judge walkthrough

## Before the room

On LaunchPad, run:

```bash
./scripts/warm_h100.sh
./scripts/judge_demo.sh http://127.0.0.1:5001
```

The rehearsal must finish with `ALL JUDGE GATES PASSED`. Open the UI through the SSH tunnel and hard-refresh once.

## Three-minute story

### 0:00–0:25 · Open data is not yet an investigation

Say: “CERN makes the data public. A newcomer still has to find the right record, understand its schema, write a valid calculation, interpret the plot, and preserve enough evidence for someone else to reproduce it.”

Open **Lab**. Point to the locked CMS / 8 TeV / proton-proton / muon / record 12341 constraints and the 500,000-entry sample.

### 0:25–0:55 · The model does not draw the plot

Point to the cut flow, selected/plotted/overflow accounting, run ID, recipe hash, and sample hash. Say: “Every number comes from a deterministic recipe over a checksum-verified bounded sample. The language model never computes a bin.”

The Z peak near 91 GeV and the highlighted 28–33 GeV reference region should be visible.

### 0:55–1:30 · Revise it conversationally

Enter:

> make both muons harder

The typed selection changes to pT ≥ 10 GeV and runs through the persisted job queue. Show the original dashed spectrum, current solid spectrum, zero-centered delta strip, exact event delta, and largest changed bins.

Refresh the page if useful: the server restores the session, baseline, revision, claims, and comparison.

### 1:30–2:05 · Separate observation from explanation

Open **Claims**. Show the four evidence classes:

- calculated from this sample;
- documented by CERN/CMS;
- interpretation;
- not established.

Ask:

> what does this bump mean?

Beamline retrieves the CERN analysis documenting the 30 GeV trigger effect. Say: “The plot establishes counts. The source supplies the explanation. Neither one becomes a discovery claim.”

### 2:05–2:30 · Plot to source entry

Click **Inspect 30 GeV region**. Show a real source entry, reconstructed muon pT/eta/phi/charge, pair mass, and the schematic direction view. State that the reduced format lacks raw hits and full event IDs, so Beamline does not invent them.

### 2:30–2:50 · Export the evidence

Click **Export evidence**. The ZIP includes the bounded sample, canonical recipe, parameters, result, baseline comparison, structured claims, exact source passages, notebook, dependency lock, provenance, and `SHA256SUMS`. The replay asserts matching histogram and cut-flow output.

### 2:50–3:00 · Close

“Beamline turns CERN open data into something a newcomer can investigate, challenge, and reproduce.”

## Original challenge coverage

In **Ask**, try:

1. `I need proton-proton collisions at 13 TeV with muons` — live catalog route, record 30555, no silent substitution into the 8 TeV lab.
2. `Why does CMS use a solenoid?` — grounded answer with CERN citations.
3. `How do black holes evaporate?` — refusal because the CERN corpus does not support the answer.

## Scientific language

Say “bounded first-entry sample,” never “representative sample.” Say “documented trigger explanation,” never “our cut proves the trigger cause.” The match score is retrieval similarity, not scientific confidence. This release does not estimate luminosity-normalized cross sections or discovery significance.
