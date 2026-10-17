import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {JWT} from 'google-auth-library';
import {PreparationError} from './jobs.ts';

type ClientOptions={email:string;key:string;keyId?:string;scopes:string[];transporterOptions:{timeout:number;retry:boolean}};
type TokenClient={getAccessToken:()=>Promise<{token?:string|null}>};
type Dependencies={credentialsFile:()=>string;project:()=>string;read:(filename:string)=>Promise<string>;client:(options:ClientOptions)=>TokenClient};
export const translationProject=()=>process.env.GOOGLE_TRANSLATE_PROJECT_ID?.trim()||'koharu-market-492802';
export function createTranslationAccessToken(overrides:Partial<Dependencies>={}){
 const deps:Dependencies={credentialsFile:()=>process.env.GOOGLE_TRANSLATE_CREDENTIALS?.trim()||path.join(process.cwd(),'.data','secrets','google-translate.json'),project:translationProject,read:file=>readFile(file,'utf8'),client:options=>new JWT(options),...overrides};
 let cached:{raw:string;project:string;client:TokenClient}|undefined;
 return async():Promise<string>=>{
  try{
   const project=deps.project();const raw=await deps.read(deps.credentialsFile());const data=JSON.parse(raw);
   if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project)||data.type!=='service_account'||data.project_id!==project||data.client_email!==`comfy-studio-translator@${project}.iam.gserviceaccount.com`||typeof data.private_key!=='string'||!data.private_key)throw new Error();
   if(!cached||cached.raw!==raw||cached.project!==project)cached={raw,project,client:deps.client({email:data.client_email,key:data.private_key,keyId:typeof data.private_key_id==='string'?data.private_key_id:undefined,scopes:['https://www.googleapis.com/auth/cloud-translation'],transporterOptions:{timeout:8000,retry:false}})};
   const {token}=await cached.client.getAccessToken();if(!token)throw new Error();return token;
  }catch{throw new PreparationError('번역 전용 서비스 계정 인증 설정을 확인해 주세요.');}
 };
}
export const translationAccessToken=createTranslationAccessToken();

export const translationAuth={getToken:translationAccessToken};
