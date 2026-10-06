param(
    [ValidateSet('Install', 'Start', 'Restart', 'Stop', 'Status', 'Remove', 'Run')]
    [string]$Action = 'Status',
    [string]$NodePath
)

$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$taskScript = Join-Path $PSScriptRoot 'local-server.ps1'
$taskHash = [System.Security.Cryptography.SHA256]::Create()
try {
    $taskSuffix = ([BitConverter]::ToString($taskHash.ComputeHash([Text.Encoding]::UTF8.GetBytes($taskRoot.ToLowerInvariant())))).Replace('-', '').Substring(0, 10)
} finally { $taskHash.Dispose() }
$taskName = 'HRBIP-Local-' + $taskSuffix
$taskData = Join-Path $taskRoot '.data'
$taskState = Join-Path $taskData 'local-server.json'
$taskLifecycle = Join-Path $taskData 'local-server-lifecycle.log'

if ($Action -eq 'Run') {
    # The scheduler runs this foreground wrapper outside the Codex terminal.
    # Child output stays local; no credentials or input data are logged here.
    New-Item -ItemType Directory -Path $taskData -Force | Out-Null
    $taskRetrySeconds = 5
    while ($true) {
        $taskAttemptStart = Get-Date
        $taskStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        try {
            if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Node executable is missing. Run Install again after installing Node 24.' }
            if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'dist/index.html'))) { throw 'Built website missing. Run npm run build first.' }
            $taskEntry = Join-Path $taskRoot 'server/index.ts'
            $taskChild = Start-Process -FilePath $NodePath -ArgumentList @('--import', 'tsx', ('"' + $taskEntry + '"'), '--production') -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskData ('local-server-' + $taskStamp + '.stdout.log')) -RedirectStandardError (Join-Path $taskData ('local-server-' + $taskStamp + '.stderr.log'))
            # Retain the process handle so Windows PowerShell can read ExitCode later.
            $null = $taskChild.Handle
            @{ task = $taskName; pid = $taskChild.Id; startedAt = (Get-Date).ToString('o'); root = $taskRoot; logPrefix = ('local-server-' + $taskStamp) } | ConvertTo-Json | Set-Content -LiteralPath $taskState -Encoding UTF8
            Add-Content -LiteralPath $taskLifecycle -Encoding UTF8 -Value ((Get-Date).ToString('o') + ' START child=' + $taskChild.Id)
            $taskChild.WaitForExit()
            Add-Content -LiteralPath $taskLifecycle -Encoding UTF8 -Value ((Get-Date).ToString('o') + ' EXIT child=' + $taskChild.Id + ' code=' + $taskChild.ExitCode)
        } catch {
            Add-Content -LiteralPath $taskLifecycle -Encoding UTF8 -Value ((Get-Date).ToString('o') + ' LAUNCH_FAILED ' + $_.Exception.Message)
        }
        if (((Get-Date) - $taskAttemptStart).TotalSeconds -ge 60) { $taskRetrySeconds = 5 }
        Add-Content -LiteralPath $taskLifecycle -Encoding UTF8 -Value ((Get-Date).ToString('o') + ' RETRY_IN_SECONDS=' + $taskRetrySeconds)
        Start-Sleep -Seconds $taskRetrySeconds
        $taskRetrySeconds = [Math]::Min(60, $taskRetrySeconds * 2)
    }
}

function Get-LocalTask {
    $taskExisting = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($taskExisting) {
        if ($taskExisting.Description -ne ('HRBIP local server: ' + $taskRoot)) { throw 'Task name collision. Refusing to modify an unrelated scheduled task.' }
    }
    return $taskExisting
}

function Stop-LocalTask {
    $taskExisting = Get-LocalTask
    if ($taskExisting) {
        # Disable before stopping to cancel a pending automatic restart.
        Disable-ScheduledTask -TaskName $taskName | Out-Null
        Stop-ScheduledTask -TaskName $taskName
        if (Test-Path -LiteralPath $taskState) {
            $taskRecorded = Get-Content -LiteralPath $taskState -Raw | ConvertFrom-Json
            $taskRunning = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$taskRecorded.pid) -ErrorAction SilentlyContinue
            $taskExpectedEntry = Join-Path $taskRoot 'server/index.ts'
            # Never terminate a PID that has been reused by an unrelated process.
            if ($taskRunning -and $taskRunning.Name -eq 'node.exe' -and $taskRunning.CommandLine -and $taskRunning.CommandLine.Contains($taskExpectedEntry)) {
                Stop-Process -Id $taskRunning.ProcessId -ErrorAction SilentlyContinue
            }
        }
        Add-Content -LiteralPath $taskLifecycle -Encoding UTF8 -Value ((Get-Date).ToString('o') + ' USER_STOP')
    }
}

if ($Action -eq 'Install') {
    if (-not $NodePath) { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
    if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Node executable not found.' }
    $taskVersion = & $NodePath --version
    if ($taskVersion -notmatch '^v24\.') { throw 'HRBIP requires Node.js 24.' }
    if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'dist/index.html'))) { throw 'Run npm ci and npm run build first.' }
    $taskExisting = Get-LocalTask
    if ($taskExisting -and $taskExisting.State -eq 'Running') { throw 'Server is running. Use Stop before reinstalling its startup settings.' }
    $taskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $taskPowerShell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $taskArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $taskScript + '" -Action Run -NodePath "' + $NodePath + '"'
    $taskCommand = New-ScheduledTaskAction -Execute $taskPowerShell -Argument $taskArguments -WorkingDirectory $taskRoot
    $taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $taskUser
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
    $taskSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $taskName -Action $taskCommand -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Description ('HRBIP local server: ' + $taskRoot) -Force | Out-Null
    $Action = 'Start'
}

if ($Action -eq 'Stop' -or $Action -eq 'Restart' -or $Action -eq 'Remove') { Stop-LocalTask }
if ($Action -eq 'Remove') {
    if (Get-LocalTask) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
    Write-Output 'HRBIP startup removed. Saved reports and database are unchanged.'
    exit 0
}
if ($Action -eq 'Start' -or $Action -eq 'Restart') {
    if (-not (Get-LocalTask)) { throw 'Run -Action Install first.' }
    Enable-ScheduledTask -TaskName $taskName | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Write-Output 'HRBIP startup requested. Open http://127.0.0.1:4173 after a few seconds.'
}

$taskInstalled = Get-LocalTask
if (-not $taskInstalled) { Write-Output 'HRBIP automatic startup is not installed.'; exit 0 }
$taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
[PSCustomObject]@{ TaskName = $taskName; State = $taskInstalled.State; LastStart = $taskInfo.LastRunTime; LastResult = $taskInfo.LastTaskResult; Project = $taskRoot } | Format-List
if (Test-Path -LiteralPath $taskState) { Get-Content -LiteralPath $taskState }
