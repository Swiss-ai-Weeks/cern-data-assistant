#!/usr/bin/env python3
"""
CERN Open Data — search and fetch raw data.

Usage:
    python fetch_cern.py search "proton"
    python fetch_cern.py search "proton" --full          # full metadata per hit
    python fetch_cern.py search "proton" --raw           # raw search envelope
    python fetch_cern.py search "proton" --full --save out.json
    python fetch_cern.py metadata 80000
    python fetch_cern.py locations 80000
    python fetch_cern.py download 80000 --output-dir ./data
"""

import sys
import json
import time
import argparse
import urllib.request
import urllib.parse
import subprocess
from pathlib import Path

CERN_API = "https://opendata.cern.ch/api/records/"


def _get_json(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def search_records(query, page=1, size=10):
    params = urllib.parse.urlencode({"q": query, "page": page, "size": size})
    try:
        return _get_json(f"{CERN_API}?{params}")
    except Exception as e:
        print(f"ERROR: search failed: {e}", file=sys.stderr)
        return None


def get_record(recid):
    try:
        return _get_json(f"{CERN_API}{recid}")
    except Exception as e:
        print(f"ERROR: could not fetch record {recid}: {e}", file=sys.stderr)
        return None


def fetch_full_for_hits(hits, delay=0.2):
    """For each hit, fetch its complete record JSON."""
    full = []
    for i, hit in enumerate(hits, 1):
        recid = hit.get("id")
        print(f"  [{i}/{len(hits)}] fetching recid {recid}...", file=sys.stderr)
        rec = get_record(recid)
        if rec:
            full.append(rec)
        time.sleep(delay)
    return full


def run_client(args_list):
    cmd = ["cernopendata-client"] + args_list
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return r.stdout
    except FileNotFoundError:
        print("ERROR: cernopendata-client not installed.", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: {' '.join(cmd)} failed\n{e.stderr}", file=sys.stderr)
        sys.exit(1)


def get_file_locations(recid, protocol="xrootd"):
    out = run_client(["get-file-locations", "--recid", str(recid),
                      "--protocol", protocol])
    return [l.strip() for l in out.splitlines() if l.strip()]


def download_files(recid, output_dir=None, filter_name=None, protocol="xrootd"):
    args = ["download-files", "--recid", str(recid), "--protocol", protocol]
    if output_dir:
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        args += ["--output-dir", output_dir]
    if filter_name:
        args += ["--filter-name", filter_name]
    print(f">> cernopendata-client {' '.join(args)}")
    run_client(args)


def print_summary(data, query):
    hits_obj = data.get("hits", {})
    hits = hits_obj.get("hits", [])
    total = hits_obj.get("total", 0)
    print(f"\nQuery: {query!r}   Total matches: {total}   Showing: {len(hits)}\n")
    print("-" * 78)
    for hit in hits:
        recid = hit.get("id")
        md = hit.get("metadata", {})
        title = (md.get("title") or "").strip()
        exp = md.get("experiment") or "—"
        rtype = (md.get("type") or {}).get("primary") or "—"
        print(f"recid {recid:<8} [{exp} / {rtype}]")
        print(f"  {title[:100]}")
        print(f"  https://opendata.cern.ch/record/{recid}")
        print("-" * 78)
    print()


def summarize_hits(data, query):
    hits_obj = data.get("hits", {})
    hits = hits_obj.get("hits", [])
    items = []
    for hit in hits:
        md = hit.get("metadata", {})
        items.append({
            "recid": hit.get("id"),
            "title": (md.get("title") or "").strip(),
            "experiment": md.get("experiment"),
            "type": (md.get("type") or {}).get("primary"),
            "url": f"https://opendata.cern.ch/record/{hit.get('id')}",
        })
    return {
        "query": query,
        "total": hits_obj.get("total", 0),
        "returned": len(items),
        "records": items,
    }


def main():
    p = argparse.ArgumentParser(description="CERN Open Data CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    ps = sub.add_parser("search", help="Search by keyword")
    ps.add_argument("query")
    ps.add_argument("--size", type=int, default=10)
    ps.add_argument("--page", type=int, default=1)
    ps.add_argument("--raw", action="store_true",
                    help="Print raw search envelope JSON")
    ps.add_argument("--full", action="store_true",
                    help="Fetch and print full metadata for every hit")
    ps.add_argument("--save", metavar="FILE",
                    help="Save the JSON output to a file")

    pm = sub.add_parser("metadata", help="Full metadata for a record")
    pm.add_argument("recid", type=int)
    pm.add_argument("--save", metavar="FILE")

    pl = sub.add_parser("locations", help="List file URLs")
    pl.add_argument("recid", type=int)
    pl.add_argument("--protocol", choices=["http", "xrootd"], default="xrootd")

    pd = sub.add_parser("download", help="Download files")
    pd.add_argument("recid", type=int)
    pd.add_argument("--output-dir", default=None)
    pd.add_argument("--filter", dest="filter_name", default=None)
    pd.add_argument("--protocol", choices=["http", "xrootd"], default="xrootd")

    args = p.parse_args()

    if args.cmd == "search":
        data = search_records(args.query, page=args.page, size=args.size)
        if not data:
            sys.exit(1)

        if args.full:
            hits = data.get("hits", {}).get("hits", [])
            records = fetch_full_for_hits(hits)
            payload = {
                "query": args.query,
                "total": data.get("hits", {}).get("total", 0),
                "returned": len(records),
                "records": records,
            }
            out = json.dumps(payload, indent=2)
            if args.save:
                Path(args.save).write_text(out)
                print(f"Saved {len(records)} records to {args.save}", file=sys.stderr)
            else:
                print(out)

        elif args.raw:
            out = json.dumps(data, indent=2)
            if args.save:
                Path(args.save).write_text(out)
                print(f"Saved raw search to {args.save}", file=sys.stderr)
            else:
                print(out)

        else:
            print_summary(data, args.query)

    elif args.cmd == "metadata":
        data = get_record(args.recid)
        if not data:
            sys.exit(1)
        out = json.dumps(data, indent=2)
        if args.save:
            Path(args.save).write_text(out)
            print(f"Saved to {args.save}", file=sys.stderr)
        else:
            print(out)

    elif args.cmd == "locations":
        locs = get_file_locations(args.recid, protocol=args.protocol)
        print(f"\n{len(locs)} files:\n")
        for loc in locs:
            print(loc)

    elif args.cmd == "download":
        download_files(args.recid, output_dir=args.output_dir,
                       filter_name=args.filter_name, protocol=args.protocol)


if __name__ == "__main__":
    main()
