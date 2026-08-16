@echo off
cd /d "%~dp0"
if not exist ".bot.pid" (
  echo Нет .bot.pid — бот, похоже, не запущен этим скриптом.
  exit /b 0
)
set /p BOTPID=<.bot.pid
echo Останавливаю pid %BOTPID%...
taskkill /PID %BOTPID% /F >NUL 2>&1
del /f /q ".bot.pid" >NUL 2>&1
echo Остановлен.
