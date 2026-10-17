import {PreparationError} from './jobs.ts';
import {translationAuth,translationProject} from './translation-auth.ts';
type Dependencies={project:()=>string;token:()=>Promise<string>;fetch:typeof fetch};
export function createPromptTranslator(overrides:Partial<Dependencies>={}){
 const deps:Dependencies={project:translationProject,token:()=>translationAuth.getToken(),fetch:(...args)=>fetch(...args),...overrides};
 return async(prompt:string):Promise<string>=>{
  const project=deps.project();
  if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project))throw new PreparationError('번역 프로젝트 설정을 확인해 주세요.');
  let token:string;
  try{token=await deps.token();}catch{throw new PreparationError('번역 전용 서비스 계정 인증 설정을 확인해 주세요.');}
  let response:Response;
  try{
   response=await deps.fetch(`https://translation.googleapis.com/v3/projects/${project}/locations/global:translateText`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({contents:[prompt],targetLanguageCode:'en',mimeType:'text/plain'}),cache:'no-store',signal:AbortSignal.timeout(8000),
   });
  }catch{throw new PreparationError('프롬프트 번역 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');}
  if(!response.ok)throw new PreparationError(response.status===401||response.status===403?'번역 전용 서비스 계정의 권한과 Cloud Translation API 설정을 확인해 주세요.':'프롬프트 번역에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  try{
   const data=await response.json();const item=data?.translations?.[0];
   if(typeof item?.translatedText!=='string'||!item.translatedText.trim()||item.translatedText.length>32000)throw new Error();
   // ASCII can be French/German too. Google detects every prompt; preserve English verbatim.
   return item.detectedLanguageCode==='en'?prompt:item.translatedText.trim();
  }catch{throw new PreparationError('프롬프트 번역 결과를 확인하지 못했습니다. 다시 시도해 주세요.');}
 };
}
export const translatePrompt=createPromptTranslator();
