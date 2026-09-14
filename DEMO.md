# Judge demo — two beats

Pitch in ~3 minutes. Hard-refresh **http://127.0.0.1:5001**. You should see a live collision, not a chat form.

**Say nothing about RAG.** Two buttons: **Fire 13 TeV muons** and **Show the GPU lying**.

If the first query hangs: the 32B model is still loading. Wait, or run `scripts/warm_h100.sh` on the GPU box.

---

## 1. Boarding pass (~50s)

Click **Fire 13 TeV muons**.

> proton-proton collisions at 13 TeV with muons

**Say:** ChatGPT will invent a CMS muon dataset. This HTTP hit opendata.cern.ch. Recid, files, DOI, download — not a language model.

**Do:** copy the `cernopendata-client` command. Export the notebook. Optionally inspect files.

**Expect:** boarding pass on the stage, real CMS/ATLAS record, copy download works.

---

## 2. The rail (~40s)

Click **Show the GPU lying**.

> How do black holes evaporate?

**Say:** same GPU. No CERN passage clears the floor, so the lecture is not the product. Left is what llama3.2 wanted to say. Right is Beamline.

**Expect:** split panel. Left: ungrounded draft. Right: `grounded: false`, rail `retrieval:no_source` (or similar). Not a confident cosmology lecture as the answer.

---

## 3. Optional if they still look (~40s)

> Why does CMS use a solenoid?

**Say:** every `[n]` is a portal page. The receipt is the score versus the floor.

**Expect:** grounded answer + grounding receipt.

Backup combo: `find CMS muon datasets and explain why CMS uses a solenoid` — pass and receipt in one turn.

Rescue beat (if they ask "what if the word isn't in the docs?"):

> What is an atom made of?

**Say:** "atom" is not a CERN glossary term, so the floor would refuse. The glossary graph maps it to
proton / electron / ion and retries once; the answer still comes only from those CERN entries.

**Expect:** low-confidence grounded answer citing Electron + Hadron, receipt line
`expanded via CERN glossary: Proton, Electron, Ion, …`. Black holes still refuse — no glossary vocabulary to expand into.

---

## If something dies

| Symptom | Fix |
|---|---|
| UI won't load | On laptop: `ssh -N -L 5001:127.0.0.1:5001 launchpad-cern` |
| `ollama offline` / slow first token | On H100: `tmux attach -t app` then `scripts/start_h100.sh` |
| Empty knowledge | On H100: `scripts/start_h100.sh --rebuild` |
| Draft column empty | llama3.2 not pulled — refusal still works; skip the left-column line |

Rehearse:

```bash
# laptop, tunnel up:
./scripts/judge_demo.sh
# or against the GPU box:
ssh launchpad-cern 'cd ~/cern-data-assistant && ./scripts/judge_demo.sh http://127.0.0.1:5001'
```
