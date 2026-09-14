# CERN Data Assistant

HPE & NVIDIA Agentic AI Hackathon challenge. Search [CERN Open Data](https://opendata.cern.ch/), inspect record files, and serve a small API on the LaunchPad H100.

## What is here

- `fetch_cern.py` — live search / metadata / download against `https://opendata.cern.ch/api/records/`
- `search_within.py` — filter files inside a saved dump such as `proton_full.json`
- `app.py` — Flask API on port **5000**

The 38 MB `proton_full.json` dump stays on the GPU box (`~/nvidia_hack/dataset/`). It is gitignored.

## On the LaunchPad H100

```bash
source ~/nvidia_hack/tf/bin/activate
cd ~/cern-data-assistant
git pull
pip install -r requirements.txt

# optional: copy the existing dump next to the API
mkdir -p dataset
cp ~/nvidia_hack/dataset/proton_full.json dataset/

python app.py
```

Then:

```bash
curl http://127.0.0.1:5000/
curl "http://127.0.0.1:5000/search?q=proton"
curl "http://127.0.0.1:5000/files?pattern=.root&ext=.root"
```

CLI (same as before):

```bash
python fetch_cern.py search "proton"
python search_within.py dataset/proton_full.json ".root"
```
