import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {assertJobId,PreparationError,ServiceError} from '../jobs.ts';import {safeVideoOutput} from '../video/jobs.ts';import type {VideoInspection} from '../video/types.ts';
import {swapCanvas,swapFrames,validateSwapInput} from './validation.ts';import type {SwapInput,SwapJob,SwapSource} from './types.ts';
type Deps={directory:string;source:(id:string)=>Promise<SwapSource>;submit:(input:SwapInput,id:string)=>Promise<string>;inspect:(promptId:string)=>Promise<VideoInspection>;recover:(id:string)=>Promise<string|null>};
export function createSwapJobs(deps:Deps){
 const locks=new Map<string,Promise<SwapJob>>();const location=(id:string)=>{assertJobId(id);return path.join(deps.directory,id+'.json');};
 async function read(id:string):Promise<SwapJob>{try{return JSON.parse(await readFile(location(id),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new ServiceError('인물 교체 작업을 찾을 수 없습니다.',404);throw e;}}
 async function save(job:SwapJob){const file=location(job.id),temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(job),'utf8');await rename(temp,file);}
 async function locked(id:string,operation:()=>Promise<SwapJob>):Promise<SwapJob>{assertJobId(id);const previous=locks.get(id);if(previous)await previous.catch(()=>{});if(locks.has(id))return locked(id,operation);const promise=operation();locks.set(id,promise);try{return await promise;}finally{if(locks.get(id)===promise)locks.delete(id);}}
 return {
  read,
  async submit(raw:SwapInput,id:string):Promise<SwapJob>{const input=validateSwapInput(raw);return locked(id,async()=>{
   await mkdir(deps.directory,{recursive:true});
   const source=await deps.source(input.sourceId),canvas=swapCanvas(source.width,source.height);
   let job:SwapJob={id,promptId:null,input,createdAt:new Date().toISOString(),state:'submitting',frames:swapFrames(input.durationSeconds),...canvas};
   try{await writeFile(location(id),JSON.stringify(job),{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;const existing=await read(id);if(JSON.stringify(existing.input)!==JSON.stringify(input))throw new ServiceError('같은 작업 번호로 다른 요청을 보낼 수 없습니다.',409);return existing;}
   try{job={...job,promptId:await deps.submit(input,id),state:'queued'};}catch(error){const rejected=error instanceof PreparationError||(error instanceof ServiceError&&error.status>=400&&error.status<500);job={...job,state:rejected?'failed':'submitting',error:rejected&&error instanceof Error?error.message:'요청 접수 상태를 확인하고 있습니다.'};}
   await save(job);return job;
  });},
  async get(id:string):Promise<SwapJob>{return locked(id,async()=>{
   let job=await read(id);if(['completed','failed'].includes(job.state))return job;
   if(!job.promptId){const recovered=await deps.recover(id);if(recovered)job={...job,promptId:recovered,state:'queued',error:undefined};}
   if(!job.promptId){if(Date.now()-Date.parse(job.createdAt)>90000){job={...job,state:'failed',error:'접수 상태를 확인하지 못했습니다. 서버 큐를 확인해 주세요.'};await save(job);}return job;}
   const inspected=await deps.inspect(job.promptId);
   job=inspected.state==='completed'&&inspected.output?{...job,state:'completed',output:safeVideoOutput(inspected.output),error:undefined}:{...job,state:inspected.state==='completed'?'failed':inspected.state,error:inspected.error};
   await save(job);return job;
  });},
 };
}
