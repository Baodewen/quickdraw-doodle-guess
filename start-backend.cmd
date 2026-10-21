@echo off
cd /d "%~dp0"
".venv-runtime\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
