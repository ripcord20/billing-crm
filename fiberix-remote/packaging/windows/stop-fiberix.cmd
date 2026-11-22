@echo off
powershell.exe -NoProfile -WindowStyle Hidden -Command "Get-CimInstance Win32_Process | Where-Object { ($_.ExecutablePath -and $_.ExecutablePath -like '*Fiberix Remote*') -or ($_.CommandLine -and ($_.CommandLine -like '*Fiberix Remote*' -or $_.CommandLine -like '*FiberixRemote.vbs*')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul
exit /b 0
