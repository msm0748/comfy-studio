[CmdletBinding()]
param([string]$ProjectId='koharu-market-492802',[switch]$CreateKey)
$ErrorActionPreference='Stop'
if($ProjectId -notmatch '^[a-z][a-z0-9-]{4,61}[a-z0-9]$'){throw 'Invalid project ID'}
if(-not(Get-Command gcloud -ErrorAction SilentlyContinue)){throw 'Install Google Cloud CLI and sign in with your project administrator account first.'}
$accountId='comfy-studio-translator'
$email="$accountId@$ProjectId.iam.gserviceaccount.com"
$roleId='comfyStudioTranslator'
function Invoke-Gcloud([string[]]$Arguments){& gcloud @Arguments;if($LASTEXITCODE -ne 0){throw 'Google Cloud setup failed. Check administrator permissions.'}}
Invoke-Gcloud @('services','enable','translate.googleapis.com','iam.googleapis.com','--project',$ProjectId,'--quiet')
$accounts=& gcloud iam service-accounts list --project $ProjectId --format='value(email)'
if($LASTEXITCODE -ne 0){throw 'Cannot list service accounts'}
if($accounts -notcontains $email){Invoke-Gcloud @('iam','service-accounts','create',$accountId,'--project',$ProjectId,'--display-name','Comfy Studio prompt translator','--quiet')}
# Narrower than Cloud Translation API User: general text prediction and quota consumption only.
$role=& gcloud iam roles list --project $ProjectId --filter="name:projects/$ProjectId/roles/$roleId" --format='value(name)'
if($LASTEXITCODE -ne 0){throw 'Cannot inspect translation role'}
$verb=if($role){'update'}else{'create'}
Invoke-Gcloud @('iam','roles',$verb,$roleId,'--project',$ProjectId,'--title','Comfy Studio Translator','--permissions','cloudtranslate.generalModels.predict,serviceusage.services.use','--stage','GA','--quiet')
Invoke-Gcloud @('projects','add-iam-policy-binding',$ProjectId,'--member',"serviceAccount:$email",'--role',"projects/$ProjectId/roles/$roleId",'--condition=None','--quiet','--format=value(projectId)')
if($CreateKey){
 $studioRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
 $secretDirectory=Join-Path $studioRoot '.data\secrets'
 $keyFile=Join-Path $secretDirectory 'google-translate.json'
 if(-not ([IO.Path]::GetFullPath($keyFile).StartsWith($studioRoot+'\'))){throw 'Credential path is outside studio'}
 if(Test-Path -LiteralPath $keyFile){throw 'Credential file already exists. Existing keys are never overwritten.'}
 New-Item -ItemType Directory -Force -Path $secretDirectory | Out-Null
 Invoke-Gcloud @('iam','service-accounts','keys','create',$keyFile,'--iam-account',$email,'--project',$ProjectId,'--quiet')
 Write-Host 'Dedicated translation credential saved to the ignored .data/secrets folder. No secret value printed.'
}else{Write-Host 'Service account and narrow role configured. Use -CreateKey only when ready to create this PC credential.'}
