# Beamline: a five-day plan for an evidence-driven CERN investigation workspace

Status: this document is the only product plan. Checked against the repo on 16 Sep 2026.
Planning window: five days, supplied by Lorik. Team size and judging rubric remain unknown.
Capacity assumption: one primary builder with coding assistance.

## Build status

Original catalog search and grounded detector Q&A still exist. The dimuon lab covers a slice of capabilities B–E. Capability A and the planned investigation/job architecture are not built. Do not pitch unchecked items below as shipped.

### Day 1 — Prove the science path

| Item | Status |
| --- | --- |
| Canonical dimuon recipe, cut-flow, overflow/underflow | Done — `backend/analysis/recipe.py` |
| Bounded record-12341 sample with portal checksums | Done — `backend/analysis/prepare.py` |
| Chosen flagship story (trigger feature vs particle) | Done as copy; **not** proven on the staged sample |
| 30 GeV feature visible on the chosen bounded sample | **Not done** — day-one pitch gate |
| Critical passages saved as verbatim CERN text | Partial — curated summaries in `service.py` / `seed.json` |
| Baseline product timings captured | **Not done** |

### Day 2 — Make it a product

| Item | Status |
| --- | --- |
| Typed Investigation / AnalysisSpec / AnalysisRun records | Partial — run cache only (`runs.sqlite3`), no investigation object |
| Job worker + streamed job transitions | **Not done** — sync Flask request |
| Refresh reconnect to persisted investigations | **Not done** — `sessionStorage` |
| Result-first workspace (section 7 layout) | Partial — lab overlay, not the main screen |
| Natural-language selection updates | Partial — keyword shortcuts in `/suggest` |
| Editable dataset constraint labels (capability A) | **Not done** |
| Never silently relax energy/experiment in search | **Not done** outside the dimuon lab |

### Day 3 — Deliver the distinction

| Item | Status |
| --- | --- |
| Baseline vs revision overlay and count delta | Done in the lab |
| Export recipe + sample + sources + notebook | Partial — ZIP exists; no rendered figure, weak lockfile |
| Documented trigger case shown beside the plot | Partial — hardcoded panel + optional RAG ask |
| Four evidence labels (Calculated / Documented / Interpretation / Not established) | **Not done** as a product model |
| Frozen ~30-prompt evaluation set | **Not done** |

### Day 4 — Make it excellent

| Item | Status |
| --- | --- |
| Click a bin and inspect source entries | Done |
| Schematic from actual muon kinematics | Partial — φ projection only |
| Detector / variable documentation map | **Not done** |
| Strict constraint UX on catalog search | **Not done** |
| Numeric controls independent of the model | Partial — sliders compute locally; explanation still calls Ask |
| Beginner user test recorded | **Not done** |
| 13 TeV NanoAOD adapter (record 30555) | Stretch — **not done** |

### Day 5 — Make it dependable

| Item | Status |
| --- | --- |
| Feature freeze | **Not done** |
| Hostile / invalid query suite | **Not done** |
| Worker restart and reconnect test | **Not done** |
| Three consecutive demo runs + backup recording | **Not done** |

## 1. The decision

Build an assistant that helps people investigate CERN data, inspect a result, challenge an interpretation, and reproduce the analysis.

Product promise: **Ask a scientific question. See the data behind the answer. Change the analysis. Take the evidence with you.**

The flagship experience is a small, working scientific investigation: compute a dimuon mass spectrum from actual CMS open data, inspect a feature in the plot, discover what the documentation says about it, change a selection, and export the calculation.

A dimuon mass spectrum is a histogram calculated from pairs of muons. Its structure can reflect particles, but also how events were selected. That ambiguity makes an excellent demonstration of why an assistant needs both data and documentation.

We should not claim a new physics discovery or a world-first product. CERN already publishes analysis code and interactive plots. Our proposed contribution is the connected workflow: natural language → suitable data → checked computation → interactive investigation → evidence-qualified explanation → reproducible handoff.

## 2. Honest assessment of the existing project

The existing product performs useful infrastructure work but leaves the user's scientific task unfinished.

| Existing implementation | What it accomplishes | What remains missing |
| --- | --- | --- |
| Live CERN catalog search and record metadata | Finds real records with identifiers and files | Checks that a record supports the intended analysis and helps the user start |
| Documentation retrieval and cited answers | Answers some detector questions from the indexed corpus | Connects the explanation to the dataset, variables, and result the user is examining |
| Planner in backend/app.py | Chooses search and/or question answering, then fetches a record | Executes a typed, reproducible investigation and revises it |
| frontend/src/lib/notebook.ts | Exports metadata and a download command | Exports the analysis that actually produced the displayed result |
| CollisionView.tsx | Displays a clearly conceptual particle animation | Displays selected reconstructed muon directions from actual event data |
| ComparePanel.tsx | Puts retrieved passages beside one another | Compares analysis revisions and calculated outputs |
| Browser session storage | Retains turns within a browser session | Persists structured investigations, runs, and artifacts |
| backend/store.py | Provides a SQLite wrapper | Is not currently wired into the app's request flow |

The recent fixes improved verification failure behavior, deployment portability, and local/remote index consistency. Local tests passed 82 cases; the live demo paths and browser citation display were exercised. That is a useful starting point, not evidence of novel product value or comprehensive scientific validation.

Keep the Flask backend, React frontend, CERN client, retrieval, streaming infrastructure, and H100 model service. Replace the main product journey. Do not spend the five days rebuilding infrastructure that already works.

## 3. Target user and outcome

Primary user: a student, data scientist, or researcher entering an unfamiliar CERN dataset who understands a question better than CERN's file formats and software conventions.

Their task is not simply to get a fluent explanation. They need to decide:

1. Which data can answer the question?
2. What do the variables and selections mean?
3. Can they obtain a first valid result?
4. What does that result support, and what does it not support?
5. Can someone else reproduce it?

Success: a newcomer completes one genuine, bounded investigation and can explain the dataset choice, the selections, the plot, and one important limitation without opening a terminal.

Lorik should be able to perform that journey and explain it in ordinary language. If the builder cannot understand the interface after a brief walkthrough, the interface has failed.

## 4. The memorable demonstration: investigate a misleading bump

CERN's analysis record 12342 explicitly notes that a feature around 30 GeV in its 2012 dimuon spectrum is caused by the trigger rather than a particle resonance. The ROOT reference tutorial repeats that observation.

This is a documented benchmark case, not a novel conclusion discovered by our software. Use it transparently to demonstrate the product's ability to connect observations to relevant evidence.

Proposed flow:

1. Open an investigation: “Show me the CMS dimuon spectrum and help me understand its peaks.”
2. Beamline selects the supported 2012 reduced-muon data and shows its origin, scope, and limitations.
3. A deterministic recipe computes the spectrum from a bounded, documented sample or a clearly labeled cached analysis.
4. The user selects the region near the documented trigger feature and asks, “Is this a new particle?”
5. Beamline distinguishes the computed observation from the published explanation, retrieves the relevant CERN passage, and explains the trigger in plain language.
6. The user changes a supported muon selection. Both baseline and revision remain visible, with an exact change log and event counts.
7. The user opens example entries contributing to the selected region and sees their measured variables and a schematic projection.
8. The user exports the exact recipe, sample identity, sources, and notebook needed to reproduce the plot.

Do not assert that changing a slider proves the trigger cause, makes the feature disappear, or recreates the original trigger. Those behaviors depend on the selected data and available fields. The published explanation and our measured comparison are different evidence types.

Day-one gate: the feature must be visible and the expected interpretation supported in the actual chosen analysis before it enters the pitch. If the bounded sample does not show it reliably, use a disclosed larger cached computation or pivot the main live demo to a well-supported Z-region investigation. Never manufacture the shape or imply an unavailable measurement.

## 5. The five core capabilities

### A. Find data that is usable for the question

Translate the request into explicit constraints: experiment, collision type, energy, objects, data format, and desired task. Show those constraints as editable labels.

Dataset choices need explanations based on metadata and supported capabilities, not a mysterious relevance percentage. Examples: correct energy, required muon variables available, compatible with the current analysis recipe, certified-run requirements known, local preview available.

Distinguish:

- Exact matches to requested constraints.
- Alternatives that require changing a constraint.
- Searchable datasets whose analysis is not supported in this release.

Never silently relax energy or experiment to obtain attractive results. A request for 13 TeV must not run the 2012 8 TeV benchmark without the user's explicit choice.

Keep broad CERN search and documentation Q&A. Bound execution to declared, tested data adapters.

### B. Run a real first analysis

For the five-day release, implement one strong recipe: a dimuon invariant-mass spectrum, with supporting muon-momentum distributions and event counts.

The calculation uses a tested template, not arbitrary model-generated Python. The model proposes validated parameters and explains results. Numerical quantities come from code.

Display the data/sample identity, event-count unit, selection sequence, histogram axes and units, and whether the calculation is fresh or cached. Use a fixed pairing rule. Prefer exactly two muons for the first recipe to match the reference tutorial and keep event counts interpretable.

Show a cut-flow: events read → required muons → charge selection → optional momentum selection → displayed range. State overflow and underflow behavior so visible-bin counts are not confused with total selected events.

Use controls only when the loaded schema supports them. The reduced 2012 dataset documents muon kinematics and charge; it does not provide every trigger, isolation, or detector-hit variable available in richer formats.

### C. Change the analysis and inspect what changed

Natural-language commands and visible controls update the same typed analysis specification.

Examples:

- “Require both muons to have higher transverse momentum.”
- “Compare this to the original selection.”
- “Show pairs with the same charge.”
- “Undo that change.”

A revision records its parent and parameter differences. Preserve the baseline. The comparison uses the same declared sample and binning unless the user explicitly changes them.

Show the literal parameter changes, resulting count changes, and overlaid spectra. The assistant explains calculated differences from the run output. It must not turn descriptive differences into causal proof.

Same-charge pairs are a diagnostic comparison here, not a validated universal background estimator. Cross sections, fitted significances, luminosity normalization, and discovery claims are outside the five-day analysis scope.

### D. Inspect the evidence from plot to event to documentation

A selected plot interval opens contributing data entries. Each entry carries a reproducible identity: source file plus entry index, and run/luminosity/event identifiers only when actually available.

The 2012 reduced dataset's published schema does not list full event identifiers. Do not invent them. Store file checksums and entry indexes for this adapter.

A compact schematic displays the selected muon directions or an eta–phi projection using actual reconstructed variables. It is not a raw detector-hit display or an exact track reconstruction.

Connect the selected quantities to a small curated detector/documentation map:

- Measured muon momentum → tracker/magnetic-field explanation.
- Muon identification → documented muon-system explanation.
- Event selection → trigger documentation.
- File columns → version-appropriate schema documentation.

If a requested quantity was not retained in the reduced data, explain that and offer the documented richer format. This makes limits useful instead of hiding them.

A full 3D detector is optional and should not displace data correctness or event inspection.

### E. Export evidence someone else can reproduce

Replace the current download-command notebook with an executable investigation bundle:

- notebook.ipynb: loads the declared sample, applies the saved recipe, regenerates the result;
- analysis.json: validated parameters, selection and pairing rules, schema version;
- manifest.json: dataset record/DOI, source file identity, sample selection, checksums, timestamps, recipe version;
- environment lock or pinned dependency list;
- sources.json or sources.md: authoritative documents, passage provenance, retrieval dates;
- histogram.csv and a figure for the run;
- README with one clear reproduction path and limitations.

The notebook and web result must use the same canonical recipe, rather than two independently generated implementations.

Export only the bounded sample needed for reproduction when practical; do not make the notebook blindly download an entire large dataset. If files are remote, document the precise download and verify their identity.

No user accounts, public sharing service, or cloud notebook platform is required for the demo.

## 6. Scientific evidence model

Give users four plain-language distinctions:

| Label | Meaning |
| --- | --- |
| Calculated from this sample | A deterministic run generated this count, histogram, or comparison |
| Documented by CERN/CMS | A specific authoritative passage supports this explanatory statement |
| Interpretation | A proposed reading of the observation, with stated limits |
| Not established | The available evidence does not support the requested conclusion |

A hash supports artifact identity and reproduction; it does not prove scientific validity. A citation supports a statement only if the cited material actually entails it. Retrieval similarity is not a probability that a claim is true.

Audit the small critical documentation set first. Save exact source passages, titles, URLs, relevant format/era, fetch time, and content digest. Existing curated seed prose must not masquerade as a verbatim CERN excerpt. Distinguish curated summaries from fetched text.

The claim “this is a new particle” must not be approved by the presence of a histogram bump. The claim “the full dataset is at 13 TeV” must come from metadata, not model recollection. Numerical prose should reference values from an analysis-run result, not a second free-form calculation by the model.

Quality filters are adapter-specific. CMS record 30555 requires a certified-run mask; its NanoAOD inputs are not already filtered to valid run segments. Record 12341 says its derived inputs used validated runs but the derived output received no further validation. Preserve those distinctions visibly and in exports.

## 7. Interface direction

The main screen should make the current investigation understandable before the user learns any navigation.

Desktop arrangement:

- Top: investigation title, dataset/energy, save/export, compact service status.
- Left: question, selected data, active selections, and run history.
- Center: the dominant plot, change controls, comparison, and entry inspection.
- Right: concise explanation, evidence passages, and limitations relevant to the selection.

This is one workspace with progressive detail, not six equal dashboards. At narrower widths, stack the result before the evidence and keep the primary controls visible.

Start with three understandable actions:

1. Find a dataset for my question.
2. Run a guided CMS investigation.
3. Understand a detector or data format.

Suggested guided investigation title: “Particle signal or selection effect?”

Chat stays available to express intent; it does not own the whole screen. The persistent object is the investigation, including its data and result.

Use clear typography, a quiet scientific palette, large readable axes, consistent units, and one accent for the active selection. Judge polish by whether a person can explain what the page is showing. Remove redundant docks, decorative telemetry, repeated confidence badges, and multiple paths to the same function.

Motion should reveal a real transition, such as a histogram changing after a selection. No fake loading stages or invented live detector activity.

## 8. Architecture that fits five days

Keep the current deployment shape. Add a small job worker and structured investigation persistence rather than introducing a distributed platform.

Browser → Flask investigation API → validated plan → bounded worker → sample adapter and recipe → run artifact store → streamed result → browser.

The explanation path reads both computed run outputs and retrieved documentation. It does not generate the values used to draw the chart.

Core records:

- Investigation: goal, explicit constraints, selected data reference, active revision.
- Dataset capability: format/version, allowed recipe IDs, available variables, quality prerequisites.
- AnalysisSpec: immutable parameters, recipe version, source/sample ID, parent revision.
- AnalysisRun: status, input hash, counts, bins, timing, warnings, artifacts.
- ClaimEvidence: explanatory statement linked to run fields and/or document passages.

Minimal endpoints can cover creation, planning, run submission, progress, artifact retrieval, revision comparison, selected-entry inspection, and export. Reuse the existing SSE approach, but emit actual tool/job transitions when they occur.

Suggested additions:

- backend/investigations.py and backend/jobs.py;
- backend/analysis/schemas.py;
- backend/analysis/adapters.py;
- backend/analysis/dimuon.py;
- backend/analysis/provenance.py;
- backend/analysis/export.py;
- frontend investigation workspace, spectrum plot, selection editor, comparison view, entry inspector, evidence drawer;
- corresponding tests and a fixed evaluation set.

Persist jobs and results so page refresh can reconnect. Do not rely on a process-local singleton or background thread alone under two Gunicorn workers. For the demo, one dedicated worker with a SQLite-backed queue and bounded concurrency is enough if tested for this deployment. More infrastructure is a cost, not an achievement.

Approved data adapters resolve files from verified portal records or manifests. Limit read volume, memory, runtime, and concurrent jobs. Never evaluate arbitrary expressions or Python supplied by the model. Cancel/reject invalid or over-budget jobs with a useful response.

H100 use: retain the current model service initially. Measure planning and explanation latency separately. Cache immutable document embeddings and input data. Do not block plot updates on a fresh language-model call when the user is adjusting a validated numeric control. Small sample calculations may run faster and more simply on CPU; use GPU computation only if measured benefit justifies the work.

The suggested AIQ/NeMo tooling is not currently installed. Confirm the actual rubric on day one. If sponsor-framework use is mandatory, make that an explicit delivery gate and budget a narrow integration around real tool calls. Do not claim package usage we have not implemented, and do not migrate everything for a badge.

## 9. Data plan and early feasibility gates

Two distinct paths preserve both challenge coverage and demo quality:

**Core benchmark: 2012 reduced CMS muons, record 12341.**

The source lists one 2.1 GiB file and approximately 61.5 million events. Inspect schema and access before committing. Start with bounded reads and develop a reproducible sample. A first-N preview may be useful but is not representative of the entire dataset; label it accordingly. Use a documented broader sample or full cached computation only when required and within resource limits. Never cherry-pick events to fabricate a feature.

**Challenge coverage: 2016H 13 TeV DoubleMuon NanoAOD, record 30555.**

Continue live search and documentation support. It lists 28 files totaling 42.9 GiB. Start with a bounded subset and the required certified-run filter if adding execution. A second runnable adapter is a stretch goal after the benchmark works end to end, not a prerequisite for basic 13 TeV catalog search.

Exact budgets are set from day-one measurements. Until measured, provisional limits for experimentation are one bounded job at a time and a controlled cache rather than full-record downloads. The released UI reports the actual sample and completion status.

Stop/adjust gates:

- Cannot access/read the benchmark within the first half-day: switch to another documented accessible reduced sample, preserving its provenance and scope.
- Cannot reliably reproduce the desired spectrum feature on day one: change the pitch to a verified feature rather than promising it.
- No end-to-end computed plot by end of day two: cut schematic event display, extra templates, and advanced explanation features.
- No functioning export and evidence-backed explanation by end of day three: freeze breadth and finish those paths.
- New feature requests after day four starts are deferred unless they fix a demo blocker.

## 10. Five-day delivery schedule

Assume focused working days with a protected final day for reliability and presentation. These are planning estimates, not guarantees.

| Day | Main work | End-of-day acceptance gate |
| --- | --- | --- |
| 1 — Prove the science path | Confirm rules; inspect/download bounded real data; implement reference recipe; audit critical source passages; capture baseline product timings; sketch workspace | A real reproducible histogram, a known sample identity, a verified explanation source, and a chosen flagship story |
| 2 — Make it a product | Typed analysis specs; job worker; investigation persistence; new result-first workspace; natural-language plan; real progress/error states | A user submits a question and obtains a chart with data identity and selections without touching a terminal |
| 3 — Deliver the distinction | Revision comparisons; evidence panel; documented trigger case; export; useful responses to unsupported claims | Change a selection, compare measured outputs, explain the documented trap, and reproduce the exported result |
| 4 — Make it excellent | Selected-entry inspector; schematic muon projection if affordable; detector/variable links; strict constraint UX; latency tuning; user test | A new user completes the investigation; original search/Q&A still work; core evaluation passes |
| 5 — Make it dependable | Feature freeze; hostile/invalid queries; restart/reconnect test; clean reproduction; repeated rehearsals; pitch and short backup recording | Three consecutive successful demo runs and a tested recovery path; no unknown core blockers |

If additional humans are available, assign one to source/physics review and one to visual QA/demo preparation. Do not use extra capacity to multiply the product scope.

## 11. Scope priorities and cuts

Must ship:

- Original challenge search and detector Q&A remain functional.
- One authentic, bounded analysis recipe.
- Result-first workspace with clear selections and provenance.
- One meaningful parameter revision and baseline comparison.
- Evidence-qualified interpretation of the documented benchmark.
- Executable export and repeatable demo.

High-value next items, only after those gates:

- Click a bin/region to inspect source entries.
- Actual-kinematics schematic with detector explanations.
- A second supported data adapter for the 13 TeV sample.

Defer:

- Full 3D digital twin or particle simulation.
- Arbitrary code generation and execution.
- Autonomous novel-particle discovery or significance claims.
- General analysis support for every CERN experiment and data format.
- Large knowledge graphs or extensive multi-agent debate UIs.
- Authentication, billing, team administration, broad cloud integrations.
- Model fine-tuning and speculative infrastructure replacement.
- Voice input unless all core paths are done and a real user need appears.

## 12. Verification and evaluation

Passing unit tests is necessary for calculations but does not establish scientific validity or usefulness.

Computational checks:

- Known four-vector examples produce expected invariant masses.
- Compare the recipe against the published/reference calculation on the exact same input and selections, with recorded tolerances.
- Pairing, missing data, units, charge selection, and empty results are handled explicitly.
- Cut-flow counts agree with the actual selected entries.
- Histogram bins plus underflow/overflow agree with the recorded event-count convention.
- Displayed entry examples satisfy the active selection and bin interval.
- Same inputs and recipe reproduce the same output; invalidate cache when any relevant input changes.
- Exported notebook reruns to matching counts and bin values in a clean environment.

Product/evidence evaluation: freeze roughly 30 prompts across exact dataset constraints, ordinary documentation questions, supported analyses, follow-up changes, unsupported variables, no-match searches, injection attempts, and exaggerated scientific claims. Keep a small held-out paraphrase set. Record expected behavior before tuning against it. Human review checks passage support and explanation correctness.

Provisional release targets, to be measured rather than advertised as current performance:

- Cached preset result becomes visible within a few seconds.
- Numeric selection update targets under two seconds on the bounded cached sample.
- Language-driven plan/explanation targets under 20 seconds warm; show computed output earlier if explanation is slower.
- No fabricated record IDs, event identifiers, numerical results, or scientific claims in the fixed evaluation set.
- Every computed result has a provenance manifest.
- Original live search, grounded detector Q&A, and appropriate refusal regressions still pass.
- Five beginner tasks attempted by at least one person who did not implement the UI; record completion and confusion points.

These are acceptance targets, not percentages to put in a pitch before running the evaluation. Report numerator/denominator and method for any evaluation result.

## 13. The three-minute pitch

0:00–0:20 — Problem: “CERN data is open. Understanding what it actually shows still requires navigating files, software, and detector documentation.”

0:20–0:50 — Ask a plain-language investigation question. Show the chosen real dataset and a computed spectrum. Explain in one sentence that each plotted entry comes from a muon-pair calculation.

0:50–1:25 — Select the documented feature and ask if it is a new particle. Reveal the supporting CERN explanation about event selection. Make clear this is a known benchmark case.

1:25–1:55 — Change a validated selection. Show baseline and revision, the exact parameter change, and the new computed counts. Let the judge choose a supported value if time allows.

1:55–2:20 — Open a contributing entry and its evidence, or the detector link if entry inspection was cut. Trace a statement back to the underlying material.

2:20–2:45 — Export the investigation and show that the notebook contains the computation, not just a search result or download command.

2:45–3:00 — Close: “Beamline makes CERN data something you can investigate, question, and reproduce.”

A separate short path demonstrates the exact challenge request for 13 TeV muon data and the CMS-solenoid documentation question. Do not pretend the 2012 benchmark satisfies a 13 TeV request.

Use a local cache of authentic inputs with its provenance visible. If a previous run is replayed, label it as a saved run. Keep an actual recording as an outage backup and identify it as a recording. Never fake a live result.

## 14. Risk and fallback decisions

| Risk | Prevention or fallback |
| --- | --- |
| Data access is slow | Inspect early, cache authentic bounded inputs, disclose cached/fresh status |
| Desired feature is not visible | Validate day one; change demo or use a disclosed larger computation |
| Physics interpretation is too strong | Separate observed values from published explanation; expert review where available |
| Model response takes too long | Make controls and plots independent of narrative generation; cache immutable inputs |
| Reduced data lacks variables | Capability checks; useful “not available in this sample” states; no invented controls |
| Notebook diverges from UI | One canonical recipe, parameters, sample ID, and numerical reproduction test |
| Service loses state | Persist investigation/run state; test worker restart and SSE reconnect |
| Rubric requires a named framework | Resolve day one; add bounded, truthful integration, trade off stretch work |
| Interface becomes confusing | One workspace and one flagship story; user test before polish freeze |
| New features destabilize demo | Day-four scope freeze and day-five rehearsal buffer |

## 15. Primary sources checked for this plan

- [CMS NanoAOD getting-started guide](https://opendata.cern.ch/docs/cms-getting-started-nanoaod): data access, Python compatibility, schema links, certified-run filtering requirements.
- [CMS 2016H DoubleMuon NanoAOD record 30555](https://opendata.cern.ch/record/30555): 13 TeV pp data, format, size, selection information, required validation masks.
- [Reduced 2012 muon dataset record 12341](https://opendata.cern.ch/record/12341): published columns, dataset scale, provenance and validation limitations.
- [Dimuon-spectrum analysis record 12342](https://opendata.cern.ch/record/12342): reference analysis and documented trigger-induced feature.
- [ROOT dimuon analysis tutorial](https://root.cern/doc/master/df102__NanoAODDimuonAnalysis_8py_source.html): reference selections, calculation, spectrum, and cut-flow.
- [CERN CMS overview](https://home.cern/science/experiments/cms/): detector explanation source; numerical details need source/era awareness rather than merging descriptions blindly.

The first implementation action is the day-one scientific spike. It decides the feasible data path before a large UI redesign. This document proposes a focused five-day build; it does not authorize claiming unbuilt features or guarantee a judging result.
