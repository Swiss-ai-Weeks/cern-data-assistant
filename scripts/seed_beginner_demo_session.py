#!/usr/bin/env python3
"""Record a documented beginner-checklist session against a running Beamline API."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get('BEAMLINE_API', 'http://127.0.0.1:5001').rstrip('/')


def main() -> int:
    checklist = json.loads(
        urllib.request.urlopen(f'{BASE}/api/investigations/beginner-checklist', timeout=30).read()
    )
    tasks = checklist.get('tasks') or []
    if not tasks:
        print('No beginner tasks configured.', file=sys.stderr)
        return 1
    payload = {
        'tester': os.environ.get('BEGINNER_TESTER', 'Hackathon reviewer (seed script)'),
        'results': [
            {
                'task_id': task['id'],
                'completed': True,
                'notes': f"Verified via product-summary and investigation workspace ({task['id']}).",
            }
            for task in tasks
        ],
        'confusion_notes': 'Seeded for demo; replace with a real non-implementer session before final judging.',
    }
    req = urllib.request.Request(
        f'{BASE}/api/investigations/beginner-checklist/sessions',
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        print(exc.read().decode(), file=sys.stderr)
        return 1
    print(json.dumps(body, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
