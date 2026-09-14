# Judge demo — Beamline (current UI)

Hard-refresh **http://127.0.0.1:5001** (H100 tunnel) or **http://127.0.0.1:5173** (local dev).

You should see: **hero → search bar → three demo beat buttons** → bottom dock.

**Do not lead with “RAG” or “agent”.** Lead with objects: catalog record, citations, refusal.

If the first query hangs, the 32B model may still be loading — wait or run `scripts/warm_h100.sh` on the GPU box.

Full product plan: [PRODUCT_PLAN.md](PRODUCT_PLAN.md).

---

## 1. Dataset handoff (~50s)

Click **Find 13 TeV muons** (or type the same query).

> proton-proton collisions at 13 TeV with muons

**Say:** ChatGPT can invent a CMS dataset. This hit **opendata.cern.ch**. Recid, size, files, DOI, and `cernopendata-client` — not a language model.

**Do:** Copy the download command. Open portal or inspect files. Point at **Other catalog matches** if useful.

**Expect:** White **dataset handoff** card, no raw HTML in the abstract.

---

## 2. Integrity rail (~40s)

Click **GPU lying demo**.

> How do black holes evaporate?

**Say:** Same stack. No CERN passage clears the floor, so the cosmology lecture is **not** the product. Left: what the small model drafted. Right: Beamline refusal + rail id + score vs floor.

**Expect:** Integrity card on the same page — no separate “stage”.

---

## 3. Grounded answer (~40s)

Click **CMS solenoid** (or ask *Why does CMS use a solenoid?*).

**Say:** Every **[n]** is a retrieved CERN page. Open the grounding receipt.

**Expect:** Answer card with citations; receipt at the bottom.

---

## 4. Backup combo

> find CMS muon datasets and explain why CMS uses a solenoid

**Expect:** Dataset handoff **and** grounded answer in one turn; follow-up chips may appear.

---

## Optional: glossary rescue

> What is an atom made of?

**Say:** “Atom” is not in the glossary; expansion maps to proton/electron/hadron entries once — still CERN-sourced, often low-confidence band.

---

## Navigation (for you)

| Control | Action |
|---------|--------|
| Bottom **Home** | Investigate (main chat) |
| **New** (file icon) | Clear thread |
| **Datasets** | Full list for current turn |
| **Search** | Focus query bar |
| **History** | Prior turns |
| **Ctrl+K** | Command palette |
| **?** | How Beamline earns trust |
| **Shift+P** then **1/2/3** | Same as demo beats (presenter) |

---

## If something dies

| Symptom | Fix |
|---------|-----|
| UI won't load | Laptop: `ssh -N -L 5001:127.0.0.1:5001 launchpad-cern` |
| Model offline in status strip | H100: `scripts/start_h100.sh` + `scripts/warm_h100.sh` |
| Empty knowledge | H100: `scripts/start_h100.sh --rebuild` |
| Draft column empty on refusal | llama3.2 missing — refusal still works |

Rehearse API path:

```bash
./scripts/judge_demo.sh
# on GPU:
ssh launchpad-cern 'cd ~/cern-data-assistant && ./scripts/judge_demo.sh http://127.0.0.1:5001'
```
