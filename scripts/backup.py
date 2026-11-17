"""Create a consistent SQLite snapshot. Run with the backend Python environment."""

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.core.config import Settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "destination",
        nargs="?",
        type=Path,
        default=ROOT
        / "backups"
        / (datetime.now().strftime("%Y%m%d-%H%M%S") + ".sqlite3"),
    )
    destination = parser.parse_args().destination.resolve()
    source = Settings.load().database_path
    if destination.exists() or destination == source.resolve():
        parser.error("Choose a new destination file.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with (
        sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True) as original,
        sqlite3.connect(destination) as backup,
    ):
        original.backup(backup)
    print(f"Saved database snapshot: {destination}")
    print(
        "Keep backend/.env with your backup; it is needed to restore passwords and keys."
    )


if __name__ == "__main__":
    main()
