$ErrorActionPreference = 'Stop'
$env:PM2_HOME = 'C:\Users\msm13\.pm2'
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
$nodePath = 'C:\Program Files\nodejs\node.exe'
$pm2Path = 'C:\Users\msm13\AppData\Roaming\npm\node_modules\pm2\bin\pm2'
$logPath = 'C:\ComfyUI\comfy-studio\.data\pm2-boot.log'
try {
    Set-Location 'C:\ComfyUI\comfy-studio'
    New-Item -ItemType Directory -Path '.data' -Force | Out-Null
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) Restoring saved PM2 applications."
    & $nodePath $pm2Path resurrect *>> $logPath
    if ($LASTEXITCODE -ne 0) { throw "PM2 restore exited with $LASTEXITCODE" }
    exit 0
}
catch {
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) Startup failed: $_"
    exit 1
}
