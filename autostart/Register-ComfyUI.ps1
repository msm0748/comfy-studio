$ErrorActionPreference = 'Stop'
$taskName = 'ComfyUI Auto Start'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    throw "Task '$taskName' already exists; inspect it before making changes."
}

$action = New-ScheduledTaskAction `
    -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -Argument '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\ComfyUI\autostart\Start-ComfyUI.ps1"' `
    -WorkingDirectory 'C:\ComfyUI\ComfyUI_windows_portable'
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT30S'
$principal = New-ScheduledTaskPrincipal -UserId 'DESKTOP-T9MOSR0\msm13' -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description 'Start local ComfyUI at boot without interactive login. Retry after exit. Listen only on 127.0.0.1:8188.' -ErrorAction Stop | Out-Null
Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath 'C:\ComfyUI\autostart\ComfyUI-Auto-Start.xml' -Encoding UTF8
Start-ScheduledTask -TaskName $taskName
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
