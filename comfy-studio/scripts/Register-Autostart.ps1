$ErrorActionPreference = 'Stop'
$logPath = 'C:\ComfyUI\comfy-studio\.data\boot-registration.log'
try {
    $taskName = 'Comfy Studio PM2 Auto Start'
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        throw "Task '$taskName' already exists. Inspect it before changing it."
    }
    $action = New-ScheduledTaskAction `
        -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
        -Argument '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\ComfyUI\comfy-studio\scripts\Start-PM2.ps1"' `
        -WorkingDirectory 'C:\ComfyUI\comfy-studio'
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $trigger.Delay = 'PT45S'
    $principal = New-ScheduledTaskPrincipal -UserId 'DESKTOP-T9MOSR0\msm13' -LogonType S4U -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew `
        -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings `
        -Description 'Restore saved PM2 apps including Comfy Studio and Cloudflare Tunnel at boot without interactive login.' | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Set-Content -LiteralPath $logPath -Value 'Registered and started successfully.'
    exit 0
}
catch {
    Set-Content -LiteralPath $logPath -Value "Registration failed: $_"
    exit 1
}
