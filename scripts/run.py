"""Start the complete app; install dependencies on first use only."""

import argparse
import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV = BACKEND / ".venv"
PYTHON = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def run(command, directory):
    subprocess.run([str(part) for part in command], cwd=directory, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8767)
    arguments = parser.parse_args()
    if not PYTHON.exists():
        print("Creating the Python environment...", flush=True)
        venv.EnvBuilder(with_pip=True).create(VENV)
        run([PYTHON, "-m", "pip", "install", "-r", "requirements.lock.txt"], BACKEND)
    if not (FRONTEND / "dist" / "index.html").exists():
        npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
        if not npm:
            raise RuntimeError("Install Node.js 22.13+ to build the React frontend.")
        run([npm, "ci"], FRONTEND)
        run([npm, "run", "build"], FRONTEND)
    print(
        f"Historical Characters: http://127.0.0.1:{arguments.port}/login\nAPI docs: http://127.0.0.1:{arguments.port}/docs",
        flush=True,
    )
    run(
        [
            PYTHON,
            "-m",
            "uvicorn",
            "app.main:create_app",
            "--factory",
            "--host",
            "127.0.0.1",
            "--port",
            str(arguments.port),
        ],
        BACKEND,
    )


if __name__ == "__main__":
    try:
        main()
    except (subprocess.CalledProcessError, RuntimeError) as error:
        print(f"Cannot start Historical Characters: {error}", file=sys.stderr)
        sys.exit(1)
