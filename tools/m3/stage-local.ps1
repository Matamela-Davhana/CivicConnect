param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$CandidateSha,
    [Parameter(Mandatory=$true)][string]$NodePath,
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin',
    [string]$NpmCli = 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js',
    [switch]$SkipPerformance,
    [switch]$HoldForDemo
)
$ErrorActionPreference = 'Stop'
$stageRepo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$stageNode = (Resolve-Path -LiteralPath $NodePath).Path
$stagePg = (Resolve-Path -LiteralPath $PostgresBin).Path
$stageNpm = (Resolve-Path -LiteralPath $NpmCli).Path
# BEGIN NODE VERSION CHECK
# Use plain version output: Windows PowerShell 5.1 strips embedded JS quotes.
$stageVersion = & $stageNode --version
if ($LASTEXITCODE -ne 0) { throw 'Could not read the Node version.' }
if ($stageVersion -notmatch '^v(\d+)\.') { throw 'Unrecognised Node version output.' }
if ([int]$Matches[1] -lt 24) { throw 'Node 24+ required.' }
# END NODE VERSION CHECK
$stageId = [guid]::NewGuid().ToString('N')
$stageRun = Join-Path $stageRepo "artifacts/staging-$stageId"
$stageSource = Join-Path $stageRun 'candidate'
$stageData = Join-Path $stageRun 'postgres-data'
$stageEvidence = Join-Path $stageRun 'evidence'
New-Item -ItemType Directory -Path $stageSource,$stageEvidence | Out-Null
$stageApi = $null
$stageUi = $null
$stagePgStarted = $false
$stageStatus = 'INCOMPLETE'
$stageNames = @('NODE_ENV','NODE_OPTIONS','HOST','PORT','DATABASE_URL','DATABASE_SSL','JWT_SECRET','BASE_URL','E2E_BASE_URL','VITE_PROXY_TARGET','VITE_API_BASE_URL','ALLOW_DISPOSABLE_E2E','PLAYWRIGHT_BROWSERS_PATH','PLAYWRIGHT_JSON_OUTPUT_NAME','PATH','PGPASSWORD','PGHOST','PGPORT','PGUSER','PGDATABASE','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS','STAGING_CANDIDATE_DIRECTORY','STAGING_EVIDENCE_DIRECTORY','STAGING_RUN_ID','STAGING_CANDIDATE_SHA')
$stageOriginal = @{}
foreach ($name in $stageNames) { $stageOriginal[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
function Invoke-StageChecked([string]$Executable,[string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Staging step failed with exit $LASTEXITCODE. Evidence is retained; no automatic retry." }
}
# BEGIN PROCESS HANDLE GUARD
function Protect-StageProcessHandle([System.Diagnostics.Process]$Process) {
    # Windows PowerShell 5.1 can lose ExitCode after redirected Start-Process.
    # Retain the native handle before waiting; never interpret a null code as success.
    $null = $Process.Handle
}
# END PROCESS HANDLE GUARD
function Get-StagePort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
    $listener.Start()
    try { return $listener.LocalEndpoint.Port } finally { $listener.Stop() }
}
function Start-StageNode([string[]]$Arguments,[string]$Directory,[string]$Name) {
    $quoted = ($Arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
    return Start-Process -FilePath $stageNode -ArgumentList $quoted -WorkingDirectory $Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stageRun "$Name.out.log") -RedirectStandardError (Join-Path $stageRun "$Name.err.log")
}
Push-Location $stageRepo
try {
    foreach ($name in $stageNames) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
    $env:PATH = (Split-Path $stageNode) + ';' + $stageOriginal['PATH']
    Invoke-StageChecked git @('cat-file','-e',"$CandidateSha`^{commit}")
    Invoke-StageChecked git @('archive','--format=zip',"--output=$stageRun/candidate.zip",$CandidateSha)
    Expand-Archive -LiteralPath (Join-Path $stageRun 'candidate.zip') -DestinationPath $stageSource
    if (!(Test-Path -LiteralPath "$stageSource/source/frontend/playwright.config.js")) { throw 'Candidate has no browser suite.' }
    $toolHashes = @(Get-ChildItem -LiteralPath $PSScriptRoot -File | ForEach-Object { @{ file=$_.Name; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } })
    $provenance = @{
        candidateSha=$CandidateSha; runId=$stageId; startedAt=[DateTime]::UtcNow.ToString('o');
        sourceArchiveSha256=(Get-FileHash -LiteralPath "$stageRun/candidate.zip" -Algorithm SHA256).Hash;
        sourceMethod='git archive of exact commit; separate extracted checkout, not the working tree';
        tools=$toolHashes; toolingGitHead=(& git rev-parse HEAD);
        toolingWorkingTreeDirty=[bool](& git status --porcelain -- tools/m3);
        toolingStatus='Hashes identify executed tools separately from the archived application candidate';
        nodeVersion=(& $stageNode --version); postgresVersion=(& "$stagePg/postgres.exe" --version);
        performanceRequested=(!$SkipPerformance); apiEntry='candidate/source/backend/server.js'; uiMode='production build served by local Vite preview with same-origin API proxy'
    }
    $provenance | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$stageEvidence/provenance.json" -Encoding UTF8
    foreach ($project in @('backend','frontend')) {
        Push-Location "$stageSource/source/$project"
        try { Invoke-StageChecked $stageNode @($stageNpm,'ci','--no-audit','--no-fund') } finally { Pop-Location }
    }
    $stageDbPort = Get-StagePort
    $stageApiPort = Get-StagePort
    $stageUiPort = Get-StagePort
    if (@($stageDbPort,$stageApiPort,$stageUiPort | Select-Object -Unique).Count -ne 3) { throw 'Port collision; no services started.' }
    $env:PGHOST='127.0.0.1'; $env:PGPORT=[string]$stageDbPort; $env:PGUSER='postgres'; $env:PGDATABASE='postgres'
    $env:PGPASSWORD = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    $stagePwFile=Join-Path $stageRun 'private-db-password.txt'
    [IO.File]::WriteAllText($stagePwFile,$env:PGPASSWORD,[Text.UTF8Encoding]::new($false))
    # Private ignored file; never include the run directory wholesale in evidence uploads.
    # Request reproducible settings; initdb may still probe the host first.
    # Bound bootstrap time; a stuck probe is setup failure, never application evidence.
    $initArgs=@('-D',$stageData,'-U','postgres','--auth-host=scram-sha-256','--auth-local=scram-sha-256',"--pwfile=$stagePwFile",'--no-locale','-E','UTF8','-c','max_connections=100','-c','shared_buffers=128MB','--debug')
    $initQuoted=($initArgs | ForEach-Object { '"' + $_ + '"' }) -join ' '
    $initProcess=Start-Process -FilePath "$stagePg/initdb.exe" -ArgumentList $initQuoted -WindowStyle Hidden -PassThru -RedirectStandardOutput "$stageRun/initdb.out.log" -RedirectStandardError "$stageRun/initdb.err.log"
    Protect-StageProcessHandle $initProcess
    if (!$initProcess.WaitForExit(60000)) {
        try { $initProcess.Kill($true) } catch { $initProcess.Kill() }
        $initProcess.WaitForExit()
        throw 'Fresh cluster initialization timed out; inspect initdb logs. No application tests ran.'
    }
    if ($initProcess.ExitCode -ne 0) { throw "Fresh cluster initialization failed; inspect $stageRun/initdb.err.log" }
    $stagePgStarted=$true
    $pgArgs="-D `"$stageData`" -l `"$stageRun/postgres.log`" -o `"-h 127.0.0.1 -p $stageDbPort`" -w start"
    $pgProcess=Start-Process -FilePath "$stagePg/pg_ctl.exe" -ArgumentList $pgArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput "$stageRun/pg-start.out.log" -RedirectStandardError "$stageRun/pg-start.err.log"
    Protect-StageProcessHandle $pgProcess
    $pgProcess.WaitForExit()
    if ($pgProcess.ExitCode -ne 0) { throw 'Owned cluster failed to start.' }
    Invoke-StageChecked "$stagePg/createdb.exe" @('-h','127.0.0.1','-p',"$stageDbPort",'-U','postgres','civicconnect_test')
    foreach ($migration in @('001_initial_schema.sql','002_account_state.sql','seed.sql')) {
        $migrationArgs=@('-X','-h','127.0.0.1','-p',"$stageDbPort",'-U','postgres','-d','civicconnect_test','-v','ON_ERROR_STOP=1','-f',"$stageSource/source/backend/migrations/$migration")
        if ($migration -eq '002_account_state.sql') { $migrationArgs += '--single-transaction' }
        Invoke-StageChecked "$stagePg/psql.exe" $migrationArgs
    }
    Invoke-StageChecked "$stagePg/psql.exe" @('-X','-d','civicconnect_test','-v','ON_ERROR_STOP=1','-c',"CREATE TABLE staging_run_identity(run_id text,candidate_sha text); INSERT INTO staging_run_identity VALUES ('$stageId','$CandidateSha');")
    $env:NODE_ENV='test'; $env:HOST='127.0.0.1'; $env:PORT=[string]$stageApiPort
    $env:DATABASE_URL="postgres://postgres:$($env:PGPASSWORD)@127.0.0.1:$stageDbPort/civicconnect_test"
    $env:DATABASE_SSL='false'; $env:JWT_SECRET=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')
    $env:BASE_URL="http://127.0.0.1:$stageApiPort"; $env:E2E_BASE_URL="http://127.0.0.1:$stageUiPort"; $env:VITE_PROXY_TARGET=$env:BASE_URL
    $env:ALLOW_DISPOSABLE_E2E='1'; $env:PLAYWRIGHT_BROWSERS_PATH=Join-Path $stageRepo 'artifacts/playwright-browsers'
    $env:PLAYWRIGHT_JSON_OUTPUT_NAME="$stageEvidence/browser-results.json"
    $env:STAGING_CANDIDATE_DIRECTORY=$stageSource; $env:STAGING_EVIDENCE_DIRECTORY=$stageEvidence
    $env:STAGING_RUN_ID=$stageId; $env:STAGING_CANDIDATE_SHA=$CandidateSha
    $stageApi=Start-StageNode @('server.js') "$stageSource/source/backend" 'api'
    Invoke-StageChecked $stageNode @('tools/devops/wait-ready.mjs',"$($env:BASE_URL)/api/health",'api')
    Push-Location "$stageSource/source/frontend"
    try {
        $env:NODE_ENV='production'
        try { Invoke-StageChecked $stageNode @('node_modules/vite/bin/vite.js','build') } finally { $env:NODE_ENV='test' }
        Invoke-StageChecked $stageNode @('node_modules/@playwright/test/cli.js','install','chromium','--only-shell')
        $stageUi=Start-StageNode @('node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',"$stageUiPort",'--strictPort') (Get-Location).Path 'ui'
        Invoke-StageChecked $stageNode @("$stageRepo/tools/devops/wait-ready.mjs",$env:E2E_BASE_URL,'web')
        Write-Host "Verifying candidate $CandidateSha in isolated local staging at $($env:E2E_BASE_URL)"
        Invoke-StageChecked $stageNode @('node_modules/@playwright/test/cli.js','test','--reporter=list,json,html')
    } finally { Pop-Location }
    if (!$SkipPerformance) { Invoke-StageChecked $stageNode @('tools/m3/exercise-local-staging.mjs') }
    $stageStatus='PASS'
    if ($HoldForDemo) {
        Write-Host "Local demonstration: $($env:E2E_BASE_URL). Public synthetic seed accounts only. Do not expose this service remotely."
        Read-Host 'Press Enter when the demonstration is finished to stop this run' | Out-Null
    }
} catch {
    $stageStatus='FAIL'
    throw
} finally {
    foreach ($owned in @($stageUi,$stageApi)) {
        if ($null -ne $owned) { $owned.Refresh(); if (!$owned.HasExited) { $owned.Kill(); $owned.WaitForExit() } }
    }
    $shutdownOk=$true
    if ($stagePgStarted) { & "$stagePg/pg_ctl.exe" -D $stageData -m fast -w stop; $shutdownOk=($LASTEXITCODE -eq 0) }
    @{ status=$stageStatus; candidateSha=$CandidateSha; finishedAt=[DateTime]::UtcNow.ToString('o'); databaseStopped=$shutdownOk; performanceSkipped=[bool]$SkipPerformance } | ConvertTo-Json | Set-Content -LiteralPath "$stageEvidence/completion.json" -Encoding UTF8
    foreach ($name in $stageNames) {
        if ($null -eq $stageOriginal[$name]) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($name,$stageOriginal[$name],'Process') }
    }
    Pop-Location
    Write-Host "Staging result: $stageStatus. Evidence: $stageEvidence. Private data/logs retained separately; no existing database changed."
    if (!$shutdownOk) { throw 'Owned PostgreSQL shutdown was not confirmed. Inspect its logs before continuing.' }
}
