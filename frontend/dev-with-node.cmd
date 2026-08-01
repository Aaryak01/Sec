@echo off
REM Wrapper so the dev server (and everything it spawns, like `next`'s own
REM `node` invocation) can find Node. The machine's system PATH still points
REM at the old C:\Program Files\nodejs, which is empty now that Node is
REM managed by nvm-windows out of C:\nvm4w\nodejs instead — this fixes PATH
REM for this process tree only, without touching the machine-wide PATH.
set PATH=C:\nvm4w\nodejs;%PATH%
cd /d "%~dp0"
npm run dev
