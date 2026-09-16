"""Prepare a bounded, provenance-recorded sample. Run outside web requests.

python -m analysis.prepare --entries 500000
Caches the fixed 2.1 GiB source after verifying its portal checksum; extracts a bounded sample.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import zlib

import awkward as ak
import numpy as np
import requests
import uproot

DIRECTORY = Path(__file__).resolve().parent.parent / 'data' / 'dimuon'
RECORD = 'https://opendata.cern.ch/api/records/12341'
FILE = 'Run2012BC_DoubleMuParked_Muons.root'
URL = f'https://opendata.cern.ch/record/12341/files/{FILE}'


def prepare(entries, directory=DIRECTORY):
    if not 1 <= entries <= 2_000_000:
        raise ValueError('Read between 1 and 2,000,000 source entries.')
    directory.mkdir(parents=True, exist_ok=True)
    response = requests.get(RECORD, timeout=40)
    response.raise_for_status()
    record = response.json()
    source = next(f for f in record['metadata']['files'] if f['key'] == FILE)
    if source['size'] > 3_000_000_000:
        raise ValueError('Source changed beyond expected size budget.')
    raw_path = directory / FILE
    if not raw_path.exists():
        print('Caching CERN source file (2.1 GiB); checking portal checksum', flush=True)
        started, downloaded, checksum = time.monotonic(), 0, 1
        part = directory / (FILE + '.partial')
        with requests.get(URL, stream=True, timeout=(15, 60)) as stream:
            stream.raise_for_status()
            with part.open('wb') as out:
                for block in stream.iter_content(1024 * 1024):
                    downloaded += len(block)
                    if downloaded > source['size'] or time.monotonic() - started > 900:
                        raise ValueError('Source download exceeded declared size or time budget.')
                    out.write(block)
                    checksum = zlib.adler32(block, checksum)
        if downloaded != source['size'] or f'adler32:{checksum:08x}' != source['checksum']:
            raise ValueError('Source length/checksum does not match the CERN record.')
        os.replace(part, raw_path)
    else:
        checksum = 1
        with raw_path.open('rb') as cached:
            for block in iter(lambda: cached.read(1024 * 1024), b''):
                checksum = zlib.adler32(block, checksum)
        if raw_path.stat().st_size != source['size'] or f'adler32:{checksum:08x}' != source['checksum']:
            raise ValueError('Cached source checksum mismatch.')
    print('Reading bounded source entries', flush=True)
    with uproot.open(raw_path, num_workers=2) as root:
        tree = root['Events']
        limit = min(entries, tree.num_entries)
        branches = ['nMuon', 'Muon_pt', 'Muon_eta', 'Muon_phi', 'Muon_mass', 'Muon_charge']
        arrays = tree.arrays(branches, entry_stop=limit, library='ak')
        two = arrays['nMuon'] == 2
        data = {k: ak.to_numpy(arrays['Muon_' + k][two]) for k in ('pt', 'eta', 'phi', 'mass', 'charge')}
        data['entry'] = np.flatnonzero(ak.to_numpy(two)).astype(np.int64)
        total = tree.num_entries
    with tempfile.NamedTemporaryFile(dir=directory, suffix='.npz', delete=False) as tmp:
        temp = Path(tmp.name)
    np.savez_compressed(temp, **data)
    digest = hashlib.sha256(temp.read_bytes()).hexdigest()
    sample_name = f'sample-{digest[:16]}.npz'
    os.replace(temp, directory / sample_name)
    manifest = {
        'sample_id': digest[:16], 'sample_file': sample_name, 'sha256': digest,
        'record_id': 12341, 'record_url': 'https://opendata.cern.ch/record/12341',
        'doi': '10.7483/OPENDATA.CMS.LVG5.QT81',
        'title': 'CMS DoubleMuParked · reduced muons · 2012',
        'experiment': 'CMS', 'energy_tev': 8, 'source_url': URL, 'source_file': FILE,
        'source_checksum': source['checksum'], 'source_bytes': source['size'],
        'tree': 'Events', 'source_total_entries': total,
        'entry_start': 0, 'entry_stop': limit, 'entries_read': limit,
        'two_muon_entries': len(data['entry']), 'branches': branches,
        'sampling': 'First contiguous source entries; not a representative sample of the full dataset.',
        'quality': 'CERN describes the derived inputs as using validated runs; the derived output received no further validation.',
        'identity': 'Source file + zero-based entry index; full detector event IDs are not present in this reduced schema.',
        'prepared_at': datetime.now(timezone.utc).isoformat(),
        'preparation': {'uproot': uproot.__version__, 'awkward': ak.__version__, 'numpy': np.__version__},
        'scope': 'Educational reconstruction from reduced muon data; no luminosity normalization, discovery significance, or raw detector hits.',
        'reference_url': 'https://opendata.cern.ch/record/12342',
        'energy_source': 'https://root.cern/doc/master/df102__NanoAODDimuonAnalysis_8py_source.html',
    }
    (directory / f'record-{digest[:16]}.json').write_text(json.dumps(record, indent=2))
    with tempfile.NamedTemporaryFile(mode='w', dir=directory, suffix='.json', delete=False) as tmp:
        json.dump(manifest, tmp, indent=2)
        manifest_temp = tmp.name
    os.replace(manifest_temp, directory / 'manifest.json')
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--entries', type=int, default=500_000)
    prepare(parser.parse_args().entries)
