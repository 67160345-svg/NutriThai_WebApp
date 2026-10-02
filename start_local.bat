@echo off
setlocal
set "PROJECT_ROOT=%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$root = (Resolve-Path $env:PROJECT_ROOT).Path;" ^
  "$envFile = Join-Path $root '.env';" ^
  "if (-not (Test-Path -LiteralPath $envFile)) { throw 'Root .env file not found. Create it from .env.example first.' };" ^
  "Get-Content -LiteralPath $envFile | ForEach-Object { if ($_ -match '^\s*([^#=\s]+)\s*=\s*(.*)$') { $name = $matches[1]; $value = $matches[2].Trim(); if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[-1] -eq '"') -or ($value[0] -eq [char]39 -and $value[-1] -eq [char]39))) { $value = $value.Substring(1, $value.Length - 2) }; [Environment]::SetEnvironmentVariable($name, $value, 'Process') } };" ^
  "if ([string]::IsNullOrWhiteSpace($env:SUPABASE_URL)) { throw 'SUPABASE_URL is missing from the root .env file.' };" ^
  "if ([string]::IsNullOrWhiteSpace($env:SUPABASE_PUBLISHABLE_KEY) -and [string]::IsNullOrWhiteSpace($env:SUPABASE_ANON_KEY)) { throw 'SUPABASE_PUBLISHABLE_KEY is missing from the root .env file.' };" ^
  "$backendDir = Join-Path $root 'backend';" ^
  "$frontendDir = Join-Path $root 'frontend';" ^
  "$backendCommand = '/k cd /d ""' + $backendDir + '"" && python -m uvicorn main:app --host 0.0.0.0 --reload --port 8000';" ^
  "$frontendCommand = '/k cd /d ""' + $frontendDir + '"" && npm run dev -- --host 0.0.0.0';" ^
  "Start-Process -FilePath $env:ComSpec -ArgumentList $backendCommand;" ^
  "Start-Process -FilePath $env:ComSpec -ArgumentList $frontendCommand;" ^
  "$ngrok = Get-Command ngrok -ErrorAction SilentlyContinue;" ^
  "if ($ngrok) { Start-Process -FilePath $env:ComSpec -ArgumentList '/k ngrok http 8443' } else { Write-Output 'ngrok not found; starting local frontend and backend only.' };" ^
  "Start-Process 'http://localhost:8443';" ^
  "Write-Output 'Local services are starting. Frontend: http://localhost:8443  Backend docs: http://localhost:8000/docs'"

if errorlevel 1 (
  echo Failed to start local services. Check the messages above.
  pause
  exit /b 1
)

endlocal
