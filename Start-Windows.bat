@echo off
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 scripts\serve.py
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python is required. Install Python 3 from https://www.python.org/downloads/ then reopen this file.
  ) else (
    python scripts\serve.py
  )
)
pause
