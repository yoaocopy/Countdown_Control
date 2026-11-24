@echo off
setlocal
cd /d "%~dp0"
if /i "%~1"=="lan" goto lan
if not "%~1"=="" set "COUNTDOWN_PUBLIC_URL=%~1"
powershell.exe -NoProfile -Command "$address = $env:COUNTDOWN_PUBLIC_URL; if (-not $address) { $address = Read-Host 'Public HTTPS URL (or L for LAN backup)' }; if ($address -eq 'L') { exit 20 }; $uri = $null; if (-not [uri]::TryCreate($address, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https' -or -not $uri.Host -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { Write-Host 'Enter an HTTPS console address such as https://example.edu/timer/, or enter L for LAN.'; exit 1 }; Start-Process -FilePath $uri.AbsoluteUri -ErrorAction Stop"
if "%errorlevel%"=="20" goto lan
if errorlevel 1 goto failed
exit /b 0

:lan
py -3 -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 goto run_py
python -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 goto run_python
echo Python 3.10 or newer is required for LAN mode. Install Python and add it to PATH.
goto failed

:run_py
py -3 -X utf8 server.py --lan --open
if errorlevel 1 goto failed
exit /b 0

:run_python
python -X utf8 server.py --lan --open
if errorlevel 1 goto failed
exit /b 0

:failed
pause
exit /b 1
