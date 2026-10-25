param(
    [ValidateSet('Docker', 'Native')][string]$Mode = 'Docker',
    [switch]$NoBrowser,
    [switch]$CheckOnly,
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$runDir = Join-Path $projectRoot '.local-run'
$processFile = Join-Path $runDir 'native-processes.json'

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed (exit $LASTEXITCODE)." }
}

function Stop-ProcessTree {
    param([int]$ProcessId)
    @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue) |
        ForEach-Object { Stop-ProcessTree $_.ProcessId }
    Stop-Process -Id $ProcessId -ErrorAction SilentlyContinue
}

function Stop-NativeProcesses {
    if (-not (Test-Path -LiteralPath $processFile)) { return }
    $records = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
    foreach ($record in @($records)) {
        $process = Get-Process -Id $record.Id -ErrorAction SilentlyContinue
        if ($process -and $process.StartTime.ToUniversalTime().Ticks -eq ([datetime]$record.Started).ToUniversalTime().Ticks) {
            Stop-ProcessTree $process.Id
        }
    }
    Remove-Item -LiteralPath $processFile
}

function Wait-Http {
    param([string]$Url, [int]$Seconds = 60)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    throw "Service did not become ready: $Url. See logs in $runDir or docker compose logs."
}

try {
    Set-Location -LiteralPath $projectRoot
    if ($Mode -eq 'Native' -and $Stop) {
        Stop-NativeProcesses
        Write-Host 'Native services stopped.'
        exit 0
    }
    # Values are parsed as data, never evaluated as commands.
    $envFile = Join-Path $projectRoot '.env'
    if (-not (Test-Path -LiteralPath $envFile)) { throw 'Create the root .env from .env.example and fill in your project values first.' }
    foreach ($line in Get-Content -LiteralPath $envFile -Encoding UTF8) {
        if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $envName = $matches[1]
            $envValue = $matches[2].Trim()
            if ($envValue.Length -ge 2 -and (($envValue[0] -eq '"' -and $envValue[-1] -eq '"') -or ($envValue[0] -eq [char]39 -and $envValue[-1] -eq [char]39))) {
                $envValue = $envValue.Substring(1, $envValue.Length - 2)
            } else { $envValue = ($envValue -replace '\s+#.*$', '').Trim() }
            [Environment]::SetEnvironmentVariable($envName, $envValue, 'Process')
        }
    }

    if ($Mode -eq 'Docker') {
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install Docker Desktop and start its engine first.' }
        Invoke-Checked 'docker' @('compose', 'version', '--short')
        if ($Stop) { Invoke-Checked 'docker' @('compose', 'stop'); exit 0 }
    }

    if (-not $env:SUPABASE_PUBLISHABLE_KEY -and $env:SUPABASE_ANON_KEY) { $env:SUPABASE_PUBLISHABLE_KEY = $env:SUPABASE_ANON_KEY }
    if (-not $env:SUPABASE_URL -or $env:SUPABASE_URL -match 'YOUR_PROJECT_ID') { throw 'Set SUPABASE_URL in the root .env.' }
    if (-not $env:SUPABASE_PUBLISHABLE_KEY -or $env:SUPABASE_PUBLISHABLE_KEY -match '^YOUR_') { throw 'Set SUPABASE_PUBLISHABLE_KEY in the root .env.' }
    $supabaseUri = $null
    if (-not [Uri]::TryCreate($env:SUPABASE_URL, [UriKind]::Absolute, [ref]$supabaseUri) -or $supabaseUri.Scheme -notin @('http', 'https')) {
        throw 'SUPABASE_URL must be a valid HTTP(S) URL.'
    }
    if (-not $env:AUTH_COOKIE_SECURE) { $env:AUTH_COOKIE_SECURE = 'false' }
    if (-not $env:FRONTEND_ORIGINS) { $env:FRONTEND_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:8443,http://127.0.0.1:8443' }

    if ($Mode -eq 'Docker') {
        Invoke-Checked 'docker' @('info', '--format', '{{.ServerVersion}}')
        Invoke-Checked 'docker' @('compose', 'config', '--quiet')
        if ($CheckOnly) { Write-Host 'Docker configuration and engine are ready.'; exit 0 }
        Write-Host 'Building the current source and waiting for healthy services...'
        Invoke-Checked 'docker' @('compose', 'up', '--build', '--detach', '--wait', '--wait-timeout', '120')
        $frontendUrl = 'http://localhost:3000'
        Wait-Http "$frontendUrl/healthz"
    } else {
        $node = Get-Command node -ErrorAction SilentlyContinue
        $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if (-not $node -or -not $npm) { throw 'Native mode needs Node.js 24 LTS and npm on PATH.' }
        $nodeVersion = [version](& $node.Source -p 'process.versions.node')
        if (-not (($nodeVersion.Major -eq 22 -and $nodeVersion -ge [version]'22.22.2') -or
            ($nodeVersion.Major -eq 24 -and $nodeVersion -ge [version]'24.15.0') -or $nodeVersion.Major -ge 26)) {
            throw 'Use Node.js 24.15+ (or a supported Node 22.22.2+/26+) for the locked dependencies.'
        }
        $python = Join-Path $projectRoot '.venv\Scripts\python.exe'
        $bootstrapPython = $python
        if (-not (Test-Path -LiteralPath $python)) {
            if (Get-Command py -ErrorAction SilentlyContinue) { $bootstrapPython = (& py -3 -c 'import sys; print(sys.executable)') }
            else {
                $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
                if (-not $pythonCommand -or $pythonCommand.Source -like '*WindowsApps*') { throw 'Install Python 3.12+ or create .venv first.' }
                $bootstrapPython = $pythonCommand.Source
            }
        }
        $pythonVersion = & $bootstrapPython -c 'import sys; print(sys.version.split()[0])'
        if ($LASTEXITCODE -ne 0 -or [version]$pythonVersion -lt [version]'3.12') { throw 'Native mode needs Python 3.12+.' }
        if ($CheckOnly) { Write-Host "Native prerequisites ready: Node $nodeVersion, Python $pythonVersion. Ports: frontend 8443, backend 8000."; exit 0 }
        foreach ($port in @(8000, 8443)) {
            if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
                throw "Port $port is already in use. Stop the existing services first (start_local.bat --stop, or --native --stop)."
            }
        }
        New-Item -ItemType Directory -Path $runDir -Force | Out-Null
        if (-not (Test-Path -LiteralPath $python)) { Invoke-Checked $bootstrapPython @('-m', 'venv', (Join-Path $projectRoot '.venv')) }
        Invoke-Checked $python @('-m', 'pip', 'install', '-r', (Join-Path $projectRoot 'backend\requirements.txt'))
        $frontendDir = Join-Path $projectRoot 'frontend'
        $lockHash = (Get-FileHash -LiteralPath (Join-Path $frontendDir 'package-lock.json') -Algorithm SHA256).Hash
        $lockStamp = Join-Path $runDir 'frontend-lock.sha256'
        if (-not (Test-Path -LiteralPath (Join-Path $frontendDir 'node_modules\vite\bin\vite.js')) -or
            -not (Test-Path -LiteralPath $lockStamp) -or (Get-Content -LiteralPath $lockStamp -Raw).Trim() -ne $lockHash) {
            Push-Location $frontendDir
            try { Invoke-Checked $npm.Source @('ci') } finally { Pop-Location }
            Set-Content -LiteralPath $lockStamp -Value $lockHash
        }
        $started = @()
        try {
            $backend = Start-Process -FilePath $python -ArgumentList @('-m', 'uvicorn', 'main:app', '--app-dir', ('"' + (Join-Path $projectRoot 'backend') + '"'), '--host', '127.0.0.1', '--port', '8000', '--reload', '--reload-dir', ('"' + (Join-Path $projectRoot 'backend') + '"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runDir 'backend.out.log') -RedirectStandardError (Join-Path $runDir 'backend.err.log')
            $started += $backend
            Wait-Http 'http://127.0.0.1:8000/health'
            $vitePath = Join-Path $frontendDir 'node_modules\vite\bin\vite.js'
            $frontend = Start-Process -FilePath $node.Source -ArgumentList @(('"' + $vitePath + '"'), '--host', '127.0.0.1', '--port', '8443', '--strictPort') -WorkingDirectory $frontendDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runDir 'frontend.out.log') -RedirectStandardError (Join-Path $runDir 'frontend.err.log')
            $started += $frontend
            $frontendUrl = 'http://127.0.0.1:8443'
            Wait-Http $frontendUrl
            $started | ForEach-Object { @{ Id = $_.Id; Started = $_.StartTime.ToUniversalTime().ToString('o') } } |
                ConvertTo-Json | Set-Content -LiteralPath $processFile
        } catch {
            foreach ($process in $started) { Stop-ProcessTree $process.Id }
            throw
        }
    }
    Write-Host "Ready: $frontendUrl"
    Write-Host 'API docs: http://localhost:8000/docs'
    Write-Host 'Stop services: start_local.bat --stop (Docker), or start_local.bat --native --stop'
    if (-not $NoBrowser) { Start-Process $frontendUrl }
} catch {
    Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
