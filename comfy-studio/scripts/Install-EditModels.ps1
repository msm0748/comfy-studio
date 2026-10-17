param([switch]$ValidateOnly)
$ErrorActionPreference='Stop'
$modelRoot='C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models'
$files=@(
  @{Folder='diffusion_models';Name='qwen_image_edit_2511_fp8mixed.safetensors';Repo='Comfy-Org/Qwen-Image-Edit_ComfyUI';Remote='split_files/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors';Size=20533762817;Hash='c9fdc158e46d3b61ef75f21ae866ca2fe808bf4a53643120d1c1e87c19280a4e'},
  @{Folder='loras';Name='Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors';Repo='lightx2v/Qwen-Image-Edit-2511-Lightning';Remote='Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors';Size=849608296;Hash='22226e8d05d354bb356627d428809f5afd7819399b077238a2b70a82883a904f'}
)
if((Get-PSDrive C).Free -lt 25GB){throw 'At least 25GiB free disk space is required.'}
foreach($file in $files){
  $destination=Join-Path (Join-Path $modelRoot $file.Folder) $file.Name
  if(-not [IO.Path]::GetFullPath($destination).StartsWith($modelRoot+'\')){throw 'Invalid model destination.'}
  Write-Output "$($file.Name) — $($file.Size) bytes"
  if($ValidateOnly){continue}
  if(Test-Path -LiteralPath $destination){
    if((Get-Item -LiteralPath $destination).Length -ne $file.Size -or (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.Hash){throw "Existing model does not match official hash: $($file.Name)"}
    Write-Output 'Existing model verified.';continue
  }
  $partial=$destination+'.part'
  & curl.exe --location --fail --silent --show-error --retry 6 --retry-delay 2 --continue-at - --output $partial "https://huggingface.co/$($file.Repo)/resolve/main/$($file.Remote)"
  if($LASTEXITCODE -ne 0){throw "Download failed. Run this script again to resume: $($file.Name)"}
  if((Get-Item -LiteralPath $partial).Length -ne $file.Size -or (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.Hash){throw "Official file verification failed: $($file.Name)"}
  Move-Item -LiteralPath $partial -Destination $destination
  Write-Output "Verified and installed: $($file.Name)"
}
