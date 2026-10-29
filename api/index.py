"""Vercel serverless entry for ClipCut FastAPI."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.paypal_main import app  # noqa: E402
