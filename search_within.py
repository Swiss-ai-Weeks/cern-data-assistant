#!/usr/bin/env python3
"""
Search WITHIN the file listings of fetched CERN records.

Usage:
    python search_within.py proton_full.json ".root"
    python search_within.py proton_full.json "DAOD_PHYSLITE" --ext .root
    python search_within.py proton_full.json "data15" --min-size 10MB
    python search_within.py proton_full.json "" --only-uris
"""

import sys
import json
import re
import argparse
from pathlib import Path


_UNITS = {"B": 1, "KB": 1024, "MB": 1024**2, "GB": 1024**3, "TB": 1024**4}


def parse_size(s):
    """Parse '10MB', '1.5GB', '512' into bytes."""
    if s is None:
        return None
    m = re.match(r"^\s*([\d.]+)\s*([KMGT]?B)?\s*$", s, re.IGNORECASE)
    if not m:
        raise ValueError(f"Bad size: {s}")
    val = float(m.group(1))
    unit = (m.group(2) or "B").upper()
    return int(val * _UNITS[unit])


def fmt_size(n):
    if n is None:
        return "?"
    for u in ("TB", "GB", "MB", "KB"):
        if n >= _UNITS[u]:
            return f"{n / _UNITS[u]:.2f} {u}"
    return f"{n} B"


def iter_files(record):
    """Yield every file dict inside a record."""
    md = record.get("metadata", {})
    for idx in md.get("_file_indices", []) or []:
        for f in idx.get("files", []) or []:
            yield f


def iter_files_via_distribution(record):
    md = record.get("metadata", {})
    for f in md.get("files", []) or []:
        yield f
    dist = md.get("distribution", {})
    if isinstance(dist, dict):
        for f in dist.get("files", []) or []:
            yield f


def all_files(record):
    seen = set()
    for source in (iter_files, iter_files_via_distribution):
        for f in source(record):
            uri = f.get("uri") or f.get("url") or f.get("filename")
            if uri and uri not in seen:
                seen.add(uri)
                yield f


def search_within(data, pattern, ext=None, min_size=None, max_size=None,
                  experiment=None, only_uris=False, regex=False):
    records = data.get("records", [])
    results = []
    total_files = 0
    total_matches = 0

    rx = None
    if regex:
        try:
            rx = re.compile(pattern, re.IGNORECASE)
        except re.error as e:
            print(f"ERROR: bad regex {pattern!r}: {e}", file=sys.stderr)
            sys.exit(1)

    for rec in records:
        recid = rec.get("id")
        md = rec.get("metadata", {})
        title = (md.get("title") or "").strip()
        rec_exp = md.get("experiment")
        if isinstance(rec_exp, list):
            rec_exp = rec_exp[0] if rec_exp else None

        if experiment and (rec_exp or "").lower() != experiment.lower():
            continue

        matches = []
        for f in all_files(rec):
            total_files += 1
            name = f.get("filename") or f.get("name") or f.get("uri", "")
            uri = f.get("uri") or f.get("url") or ""
            size = f.get("size")

            if pattern:
                haystack = f"{name} {uri}"
                if rx:
                    if not rx.search(haystack):
                        continue
                else:
                    if pattern.lower() not in haystack.lower():
                        continue

            if ext and not name.lower().endswith(ext.lower()):
                continue

            if min_size is not None and (size is None or size < min_size):
                continue
            if max_size is not None and (size is None or size > max_size):
                continue

            matches.append(f)
            total_matches += 1

        if matches:
            results.append({
                "recid": recid,
                "title": title,
                "experiment": rec_exp,
                "matched": len(matches),
                "files": matches,
            })

    return {
        "pattern": pattern,
        "regex": regex,
        "ext": ext,
        "records_scanned": len(records),
        "total_files_seen": total_files,
        "total_matches": total_matches,
        "records_with_matches": len(results),
        "results": results,
    }, only_uris


def print_results(out, only_uris=False):
    if only_uris:
        for rec in out["results"]:
            for f in rec["files"]:
                print(f.get("uri") or f.get("filename"))
        return

    print(f"\nPattern: {out['pattern']!r}"
          + (f"  ext={out['ext']}" if out["ext"] else "")
          + ("  regex=yes" if out["regex"] else ""))
    print(f"Records scanned: {out['records_scanned']}")
    print(f"Files seen:      {out['total_files_seen']}")
    print(f"Files matched:   {out['total_matches']}")
    print(f"Records with hits: {out['records_with_matches']}\n")
    print("=" * 78)

    for rec in out["results"]:
        print(f"\nrecid {rec['recid']}  [{rec['experiment']}]  "
              f"({rec['matched']} match(es))")
        print(f"  {rec['title'][:100]}")
        print("-" * 78)
        for f in rec["files"]:
            name = f.get("filename") or f.get("name") or "?"
            size = fmt_size(f.get("size"))
            uri = f.get("uri") or f.get("url") or ""
            checksum = f.get("checksum", "")
            print(f"  {size:>10}  {name}")
            if uri:
                print(f"              {uri}")
            if checksum:
                print(f"              checksum: {checksum}")
    print()


def main():
    p = argparse.ArgumentParser(description="Search within CERN record files")
    p.add_argument("json_file", help="The proton_full.json (or similar)")
    p.add_argument("pattern", nargs="?", default="",
                   help="Substring or regex to match in filename/URI")
    p.add_argument("--regex", action="store_true",
                   help="Treat pattern as a regex")
    p.add_argument("--ext", help="Filter by extension, e.g. .root")
    p.add_argument("--min-size", help="Minimum file size, e.g. 10MB")
    p.add_argument("--max-size", help="Maximum file size, e.g. 1GB")
    p.add_argument("--experiment", help="Only this experiment, e.g. ATLAS")
    p.add_argument("--only-uris", action="store_true",
                   help="Print only matching URIs (one per line)")
    p.add_argument("--save", metavar="FILE",
                   help="Save matched results as JSON")

    args = p.parse_args()

    path = Path(args.json_file)
    if not path.exists():
        print(f"ERROR: {path} not found", file=sys.stderr)
        sys.exit(1)

    data = json.loads(path.read_text())

    min_size = parse_size(args.min_size) if args.min_size else None
    max_size = parse_size(args.max_size) if args.max_size else None

    out, only_uris = search_within(
        data,
        pattern=args.pattern,
        ext=args.ext,
        min_size=min_size,
        max_size=max_size,
        experiment=args.experiment,
        only_uris=args.only_uris,
        regex=args.regex,
    )

    print_results(out, only_uris=only_uris)

    if args.save:
        Path(args.save).write_text(json.dumps(out, indent=2))
        print(f"Saved matched results to {args.save}", file=sys.stderr)


if __name__ == "__main__":
    main()
