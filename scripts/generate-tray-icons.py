"""Deprecated — use scripts/generate-miror-icons.py instead."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(ROOT / "scripts" / "generate-miror-icons.py")], check=True)
