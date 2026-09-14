import sys
from pathlib import Path

# `python -m unittest discover -s tests` puts tests/ on sys.path, not backend/.
_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))
