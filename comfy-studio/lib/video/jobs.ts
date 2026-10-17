import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {assertJobId,ServiceError,PreparationError} from '../jobs.ts';import {getVideoPreset,videoFrames} from './presets.ts';import {validateVideoInput} from './validation.ts';
import type {VideoInput,VideoJobRecord,VideoInspection,VideoOutputRef,VideoMedia} from './types.ts';
export function safeVideoOutput(raw:unknown):VideoOutputRef{
 const r=raw as VideoOutputRef;
 if(!r||r.type!=='output'||typeof r.filename!=='string'||!r.filename||!/^[-a-zA-Z0-9_ .]+\.mp4$/i.test(r.filename)||r.filename.includes('..')||typeof r.subfolder!=='string'||/[\\:\x00]/.test(r.subfolder)||r.subfolder.startsWith('/')||r.subfolder.split('/').some(p=>p==='..'||p==='.')||r.subfolder.length>256)throw new ServiceError('안전하지 않은 영상 경로입니다.',400);
 return {filename:r.filename,subfolder:r.subfolder,type:'output'};
}
export function normalizeVideoHistory(raw:unknown):VideoInspection{
 const h=raw as {status?:{completed?:boolean;status_str?:string;messages?:[string,unknown][]};outputs?:Record<string,{images?:unknown[];videos?:unknown[]}>};
 if(h.status?.status_str==='error'||h.status?.messages?.some(([type])=>['execution_error','execution_interrupted'].includes(type)))return {state:'failed',error:'영상을 생성하지 못했습니다. 서버 상태와 메모리를 확인해 주세요.'};
 if(h.status?.completed||h.status?.status_str==='success'){
  const outputs=Object.values(h.outputs??{}).flatMap(o=>[...(o.images??[]),...(o.videos??[])]).filter(r=>typeof (r as VideoOutputRef)?.filename==='string'&&(r as VideoOutputRef).filename.toLowerCase().endsWith('.mp4'));
  if(outputs.length!==1)return {state:'failed',error:'저장된 영상 결과를 확인하지 못했습니다.'};return {state:'completed',output:safeVideoOutput(outputs[0])};
 }
 return {state:'running'};
}
type Deps={directory:string;submit:(input:VideoInput,id:string)=>Promise<string>;inspect:(promptId:string)=>Promise<VideoInspection>;recover:(id:string)=>Promise<string|null>;finalize:(job:VideoJobRecord)=>Promise<VideoMedia>};
export function createVideoJobService(deps:Deps){
 const locks=new Map<string,Promise<VideoJobRecord>>(),finalizing=new Map<string,Promise<void>>(),pending=new Map<string,VideoJobRecord>();
 const location=(id:string)=>{assertJobId(id);return path.join(deps.directory,id+'.json');};
 async function read(id:string):Promise<VideoJobRecord>{if(pending.has(id))return pending.get(id)!;try{return JSON.parse(await readFile(location(id),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new ServiceError('영상 작업을 찾을 수 없습니다.',404);throw e;}}
 async function save(job:VideoJobRecord){pending.set(job.id,job);const file=location(job.id),temp=file+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify(job),'utf8');await rename(temp,file);pending.delete(job.id);}catch(e){if(!job.promptId)throw e;}}
 async function locked(id:string,operation:()=>Promise<VideoJobRecord>):Promise<VideoJobRecord>{assertJobId(id);const previous=locks.get(id);if(previous)await previous.catch(()=>{});if(locks.has(id))return locked(id,operation);const promise=operation();locks.set(id,promise);try{return await promise;}finally{if(locks.get(id)===promise)locks.delete(id);}}
 function finalize(job:VideoJobRecord){
  if(finalizing.has(job.id))return;
  const promise=Promise.resolve().then(()=>deps.finalize(job)).then(media=>locked(job.id,async()=>{const current=await read(job.id);const next={...current,state:'completed' as const,phase:null,media,error:undefined};await save(next);return next;})).catch(()=>locked(job.id,async()=>{const current=await read(job.id);const next={...current,state:'failed' as const,error:'영상 저장을 완료하지 못했습니다. 원본 생성 작업은 다시 실행하지 않습니다.'};await save(next);return next;})).then(()=>{}).finally(()=>finalizing.delete(job.id));
  finalizing.set(job.id,promise);
 }
 return {
  read,
  async submit(raw:VideoInput,id:string):Promise<VideoJobRecord>{const input=validateVideoInput(raw);return locked(id,async()=>{
   await mkdir(deps.directory,{recursive:true});const preset=getVideoPreset(input.resolution),frames=videoFrames(input.durationSeconds);
   let job:VideoJobRecord={id,promptId:null,input,createdAt:new Date().toISOString(),state:'submitting',phase:'generation',generationWidth:864,generationHeight:480,width:preset.width,height:preset.height,frames,fps:24,actualDurationSeconds:frames/24};
   try{await writeFile(location(id),JSON.stringify(job),{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;const existing=await read(id);if(JSON.stringify(existing.input)!==JSON.stringify(input))throw new ServiceError('같은 작업 번호로 다른 영상을 요청할 수 없습니다.',409);return existing;}
   try{job={...job,promptId:await deps.submit(input,id),state:'queued'};}catch(error){const rejected=error instanceof PreparationError||(error instanceof ServiceError&&error.status>=400&&error.status<500);job={...job,state:rejected?'failed':'submitting',error:rejected&&error instanceof ServiceError?error.message:'영상 요청의 접수 상태를 확인하고 있습니다.'};}
   await save(job);return job;
  });},
  async get(id:string):Promise<VideoJobRecord>{return locked(id,async()=>{
   let job=await read(id);if(['completed','failed'].includes(job.state))return job;
   if(job.sourceOutput){finalize(job);return job;}
   if(!job.promptId){const recovered=await deps.recover(id);if(recovered)job={...job,promptId:recovered,state:'queued',error:undefined};}
   if(!job.promptId){if(Date.now()-Date.parse(job.createdAt)>90000){job={...job,state:'failed',error:'영상 접수 상태를 확인하지 못했습니다. 서버 큐를 확인해 주세요.'};await save(job);}return job;}
   const inspected=await deps.inspect(job.promptId);
   if(inspected.state==='completed'&&inspected.output){job={...job,state:'processing',phase:'encoding',sourceOutput:safeVideoOutput(inspected.output),error:undefined};await save(job);finalize(job);}
   else{job={...job,state:inspected.state,error:inspected.error};await save(job);}
   return job;
  });},
 };
}
