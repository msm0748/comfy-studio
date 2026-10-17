import { getPreset } from './presets.ts';
import type { GenerationInput,JobRecord,ModelOption } from './types.ts';

export class HttpError extends Error {
  status:number;
  constructor(message:string,status:number){super(message);this.status=status;}
}
export const isActiveJob=(job:JobRecord|null)=>!!job&&['submitting','queued','running'].includes(job.state);
export function createPendingJob(input:GenerationInput):JobRecord {
  const size=getPreset(input.modelId).sizes.find(size=>size.id===input.sizeId)!;
  return {id:crypto.randomUUID(),promptId:null,input,createdAt:new Date().toISOString(),state:'submitting',images:[],width:size.width,height:size.height};
}
export async function restorePendingJob(pending:JobRecord,read:(id:string)=>Promise<JobRecord>):Promise<JobRecord> {
  try{return await read(pending.id);}catch{return {...pending,error:'요청 접수 상태를 확인하고 있습니다. 연결이 복구되면 같은 작업을 이어서 확인합니다.'};}
}
export async function submitOrRecover(pending:JobRecord,send:(pending:JobRecord)=>Promise<JobRecord>,read:(id:string)=>Promise<JobRecord>):Promise<JobRecord> {
  try{return await send(pending);}catch(error){
    if(error instanceof HttpError&&error.status>=400&&error.status<500)return {...pending,state:'failed',error:error.message};
    return restorePendingJob(pending,read);
  }
}
export function disableModels(models:ModelOption[]):ModelOption[]{return models.map(model=>({...model,available:false,reason:'서버 연결을 다시 확인해 주세요.'}));}
export function canGenerate(connected:boolean|null,model:ModelOption|undefined,busy:boolean,prompt:string):boolean {
  return connected===true&&model?.available===true&&!busy&&!!prompt.trim();
}
