$ErrorActionPreference = 'Stop'
$portableRoot = 'C:\ComfyUI\ComfyUI_windows_portable'
$logRoot = 'C:\ComfyUI\autostart\logs'
$mutex = New-Object System.Threading.Mutex($false, 'Global\ComfyUI-Autostart-8188')
$ownsMutex = $false

try {
    try { $ownsMutex = $mutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { exit 0 }

    New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $process = Start-Process -FilePath "$portableRoot\python_embeded\python.exe" `
        -ArgumentList '-s ComfyUI\main.py --windows-standalone-build --disable-auto-launch --listen 127.0.0.1 --port 8188' `
        -WorkingDirectory $portableRoot -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput "$logRoot\comfyui-$stamp.stdout.log" `
        -RedirectStandardError "$logRoot\comfyui-$stamp.stderr.log"

    # Even a clean server exit should be restarted by Task Scheduler.
    if ($process.ExitCode -eq 0) { exit 1 }
    exit $process.ExitCode
}
catch {
    Add-Content -LiteralPath "$logRoot\launcher-errors.log" -Value "$(Get-Date -Format o) $_"
    exit 1
}
finally {
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
