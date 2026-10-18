param([string]$ComfyRoot='C:\ComfyUI\ComfyUI_windows_portable\ComfyUI')
$ErrorActionPreference='Stop'
$musicProject=Split-Path -Parent $PSScriptRoot
$musicSource=Join-Path $musicProject 'comfy_nodes\music_auto'
$musicCustomRoot=Join-Path (Resolve-Path -LiteralPath $ComfyRoot).Path 'custom_nodes'
$musicTarget=Join-Path $musicCustomRoot 'comfystudio_music_auto'
if(-not [IO.Path]::GetFullPath($musicTarget).StartsWith([IO.Path]::GetFullPath($musicCustomRoot)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Node destination outside custom_nodes'}
$musicBackup=Join-Path $musicProject ('.data\music-auto-node-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $musicTarget -Force | Out-Null
foreach($musicFile in @('__init__.py','node.py','policy.py')){
 $musicDestination=Join-Path $musicTarget $musicFile
 if(Test-Path -LiteralPath $musicDestination){New-Item -ItemType Directory -Path $musicBackup -Force | Out-Null;Copy-Item -LiteralPath $musicDestination -Destination (Join-Path $musicBackup $musicFile)}
 Copy-Item -LiteralPath (Join-Path $musicSource $musicFile) -Destination $musicDestination -Force
}
Write-Output 'Music auto-ending node installed. Restart ComfyUI only after its queue is idle.'
