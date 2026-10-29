#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Python is required. Install Python 3 from https://www.python.org/downloads/ and reopen this file.'
  read -r -p 'Press Return to close.'
  exit 1
fi
python3 scripts/serve.py
