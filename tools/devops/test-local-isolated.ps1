param(
    [Parameter(Mandatory=$true)][string]$NodePath,
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin',
    [string]$ResumeInitializedData
)
$ErrorActionPreference = 'Stop'
$taskRepo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$taskNode = (Resolve-Path $NodePath).Path
$taskPg = (Resolve-Path $PostgresBin).Path
if ((& $taskNode -p 'Number(process.versions.node.split(".")[0])') -lt 24) { throw 'Node 24 or newer is required.' }
foreach ($name in @('initdb.exe','pg_ctl.exe','createdb.exe','psql.exe')) {
    if (!(Test-Path -LiteralPath (Join-Path $taskPg $name))) { throw "Missing PostgreSQL tool: $name" }
}
if ($ResumeInitializedData) {
    $taskData = (Resolve-Path -LiteralPath $ResumeInitializedData).Path
    $allowed = '^' + [regex]::Escape($taskRepo) + '\\artifacts\\isolated-[a-f0-9]{32}\\postgres-data$'
    if ($taskData -notmatch $allowed) { throw 'Resume is restricted to a cluster created under this checkout artifacts/isolated-<id>/postgres-data.' }
    $taskRun = Split-Path $taskData
    foreach ($directory in @($taskData, $taskRun, (Split-Path $taskRun))) {
        if ((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse points are not allowed for disposable clusters.' }
    }
    $control = & (Join-Path $taskPg 'pg_controldata.exe') $taskData
    if ($LASTEXITCODE -ne 0 -or ($control -join "`n") -notmatch 'Database cluster state:\s+shut down\s') { throw 'Resume requires a fully initialized, stopped cluster.' }
} else {
    $taskRun = Join-Path $taskRepo ('artifacts/isolated-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $taskRun | Out-Null
    $taskData = Join-Path $taskRun 'postgres-data'
}
$taskApi = $null
$taskUi = $null
$taskPgStarted = $false
$taskEnvNames = @('NODE_ENV','HOST','PORT','DATABASE_URL','DATABASE_SSL','JWT_SECRET','BASE_URL','E2E_BASE_URL','VITE_PROXY_TARGET','ALLOW_DISPOSABLE_E2E','PLAYWRIGHT_BROWSERS_PATH','PATH','PGPASSWORD','PGHOST','PGPORT','PGUSER','PGDATABASE','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS')
$taskOriginal = @{}
foreach ($name in $taskEnvNames) { $taskOriginal[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
function Get-FreeTaskPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return $listener.LocalEndpoint.Port } finally { $listener.Stop() }
}
function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Verification command failed (exit $LASTEXITCODE): $Executable" }
}
function Start-TaskNode([string[]]$Arguments, [string]$Directory, [string]$Name) {
    $quoted = ($Arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
    return Start-Process -FilePath $taskNode -ArgumentList $quoted -WorkingDirectory $Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRun "$Name.out.log") -RedirectStandardError (Join-Path $taskRun "$Name.err.log")
}
Push-Location $taskRepo
try {
    # Do not inherit credentials, service files or database options from the user's session.
    foreach ($name in $taskEnvNames | Where-Object { $_ -like 'PG*' }) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
    $env:PATH = (Split-Path $taskNode) + ';' + $env:PATH
    $taskDbPort = Get-FreeTaskPort
    $env:PGPORT = [string]$taskDbPort
    $env:PGHOST = '127.0.0.1'
    $env:PGUSER = 'postgres'
    $env:PGDATABASE = 'postgres'
    $env:NODE_ENV = 'test'
    $env:HOST = '127.0.0.1'
    $env:PORT = [string](Get-FreeTaskPort)
    $taskUiPort = [string](Get-FreeTaskPort)
    $env:DATABASE_URL = "postgres://postgres@127.0.0.1:$taskDbPort/civicconnect_test"
    $env:DATABASE_SSL = 'false'
    $env:JWT_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    $env:BASE_URL = "http://127.0.0.1:$($env:PORT)"
    $env:E2E_BASE_URL = "http://127.0.0.1:$taskUiPort"
    $env:VITE_PROXY_TARGET = $env:BASE_URL
    $env:ALLOW_DISPOSABLE_E2E = '1'
    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $taskRepo 'artifacts/playwright-browsers'
    Write-Host 'Preparing a loopback-only disposable PostgreSQL cluster. Your review database is not accessed.'
    if (!$ResumeInitializedData) {
        Invoke-Checked (Join-Path $taskPg 'initdb.exe') @('-D', $taskData, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8')
    }
    $pgArgs = "-D `"$taskData`" -l `"$(Join-Path $taskRun 'postgres.log')`" -o `"-h 127.0.0.1 -p $taskDbPort`" -w start"
    $taskPgStarted = $true
    $pgProcess = Start-Process -FilePath (Join-Path $taskPg 'pg_ctl.exe') -ArgumentList $pgArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRun 'pg-start.out.log') -RedirectStandardError (Join-Path $taskRun 'pg-start.err.log')
    # Start-Process -Wait waits for the daemon's entire descendant tree on Windows.
    # Wait only for pg_ctl; its own -w confirms PostgreSQL readiness.
    $pgProcess.WaitForExit()
    if ($pgProcess.ExitCode -ne 0) { throw "Disposable database did not start; see $taskRun" }
    $dbExists = & (Join-Path $taskPg 'psql.exe') -X -h 127.0.0.1 -p $taskDbPort -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname='civicconnect_test'"
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the disposable cluster.' }
    if ($ResumeInitializedData -and $dbExists -eq '1') {
        Write-Host 'Reusing previously seeded synthetic test data; no reset or seed rerun.'
        Invoke-Checked (Join-Path $taskPg 'psql.exe') @('-X','-h','127.0.0.1','-p',"$taskDbPort",'-U','postgres','-d','civicconnect_test','-v','ON_ERROR_STOP=1','-c','SELECT active,token_version FROM users LIMIT 0')
    } else {
        Invoke-Checked (Join-Path $taskPg 'createdb.exe') @('-h','127.0.0.1','-p',"$taskDbPort",'-U','postgres','civicconnect_test')
        foreach ($migration in @('001_initial_schema.sql','002_account_state.sql','seed.sql')) {
            $migrationArgs = @('-X','-h','127.0.0.1','-p',"$taskDbPort",'-U','postgres','-d','civicconnect_test','-v','ON_ERROR_STOP=1','-f',"source/backend/migrations/$migration")
            if ($migration -eq '002_account_state.sql') { $migrationArgs += '--single-transaction' }
            Invoke-Checked (Join-Path $taskPg 'psql.exe') $migrationArgs
        }
    }
    foreach ($component in @('frontend','backend','browser')) { Invoke-Checked $taskNode @('tools/devops/ci-contract.mjs', $component) }
    Invoke-Checked $taskNode @('--test', 'tools/devops/helpers.test.mjs', 'tools/devops/e2e-safety.test.cjs')
    Push-Location source/backend
    try {
        Invoke-Checked $taskNode @('node_modules/eslint/bin/eslint.js', '.')
        Invoke-Checked $taskNode @('--test', 'tests/unit/*.test.cjs')
        Invoke-Checked $taskNode @('--test', 'tests/integration/*.test.cjs')
        $taskApi = Start-TaskNode @('server.js') (Get-Location).Path 'api'
    } finally { Pop-Location }
    Invoke-Checked $taskNode @('tools/devops/wait-ready.mjs', "$($env:BASE_URL)/api/health", 'api')
    Push-Location source/backend
    try { Invoke-Checked $taskNode @('--test', 'tests/e2e/*.test.cjs') } finally { Pop-Location }
    Push-Location source/frontend
    try {
        Invoke-Checked $taskNode @('node_modules/eslint/bin/eslint.js', '.')
        Invoke-Checked $taskNode @('node_modules/vitest/vitest.mjs', 'run')
        $env:NODE_ENV = 'production'
        try { Invoke-Checked $taskNode @('node_modules/vite/bin/vite.js', 'build') } finally { $env:NODE_ENV = 'test' }
        Invoke-Checked $taskNode @('node_modules/@playwright/test/cli.js', 'install', 'chromium', '--only-shell')
        $taskUi = Start-TaskNode @('node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', $taskUiPort, '--strictPort') (Get-Location).Path 'ui'
    } finally { Pop-Location }
    Invoke-Checked $taskNode @('tools/devops/wait-ready.mjs', $env:E2E_BASE_URL, 'web')
    Push-Location source/frontend
    try { Invoke-Checked $taskNode @('node_modules/@playwright/test/cli.js', 'test') } finally { Pop-Location }
    Write-Host 'PASS: isolated local verification completed. This is not a GitHub CI or deployment result.'
} finally {
    foreach ($ownedProcess in @($taskUi, $taskApi)) {
        if ($null -ne $ownedProcess) {
            $ownedProcess.Refresh()
            if (!$ownedProcess.HasExited) { $ownedProcess.Kill(); $ownedProcess.WaitForExit() }
        }
    }
    if ($taskPgStarted) { & (Join-Path $taskPg 'pg_ctl.exe') -D $taskData -m fast -w stop }
    foreach ($name in $taskEnvNames) {
        if ($null -eq $taskOriginal[$name]) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($name, $taskOriginal[$name], 'Process') }
    }
    Pop-Location
    Write-Host "Stopped this run's services. Synthetic database/logs retained locally under $taskRun"
}
