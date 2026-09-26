@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 -B scripts\launch.py %*
  goto done
)
where python >nul 2>nul
if not errorlevel 1 (
  python -B scripts\launch.py %*
  goto done
)
echo Python 3.10+ is required. Install Python, then run Start.bat again.
echo Please read 开始使用.txt.
:done
pause
