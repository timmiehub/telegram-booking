@echo off
REM Безопасный старт бота: один процесс, без 409 Conflict
cd /d "%~dp0"

if exist ".bot.pid" (
  set /p OLDPID=<.bot.pid
  tasklist /FI "PID eq %OLDPID%" 2>NUL | find "%OLDPID%" >NUL
  if not errorlevel 1 (
    echo [ANTIBAN] Уже запущен pid %OLDPID%. Сначала: stop-bot.cmd
    exit /b 1
  )
  del /f /q ".bot.pid" >NUL 2>&1
)

echo Starting bot...
node index.js
