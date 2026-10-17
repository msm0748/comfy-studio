# ComfyUI automatic startup

Windows scheduled task: `ComfyUI Auto Start`.

- Trigger: system startup, delayed 30 seconds; interactive login is not required.
- Account: `msm13`, S4U, limited privileges. No password is stored.
- Endpoint: `http://127.0.0.1:8188` (local access only).
- Browser: does not open automatically.
- Restart: one minute after exit, up to 999 retries; no execution time limit.
- Existing Cloudflare and website configuration is not changed.
- Startup can take several minutes while custom nodes initialize.

Task definition: `ComfyUI-Auto-Start.xml`. Launcher logs: `logs`.
The launcher uses the existing embedded Python and NVIDIA GPU setup.
S4U tasks have no Windows network credentials; use an interactive session
for operations that require Windows-authenticated network shares.

Inspect in PowerShell:

```powershell
Get-ScheduledTask -TaskName 'ComfyUI Auto Start'
Get-ScheduledTaskInfo -TaskName 'ComfyUI Auto Start'
Invoke-RestMethod 'http://127.0.0.1:8188/system_stats'
```

To disable automatic startup, use Task Scheduler or an administrator PowerShell:

```powershell
Disable-ScheduledTask -TaskName 'ComfyUI Auto Start'
Stop-ScheduledTask -TaskName 'ComfyUI Auto Start'
```

To enable and start again:

```powershell
Enable-ScheduledTask -TaskName 'ComfyUI Auto Start'
Start-ScheduledTask -TaskName 'ComfyUI Auto Start'
```

Registration is performed once by `Register-ComfyUI.ps1` in an administrator
PowerShell. It refuses to overwrite an existing task with the same name.
