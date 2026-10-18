import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getPreset } from './presets.ts';
import type { ApiGraph, GenerationInput, ImageRef, JobRecord, NodeInfo } from './types.ts';

import {ServiceError} from './service-error.ts';
export {ServiceError} from './service-error.ts';
/** Preparation failed before /prompt was called, so acceptance is impossible. */
export class PreparationError extends ServiceError {}
export function assertJobId(id:string) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new ServiceError('올바르지 않은 작업 번호입니다.',400);
}
function safeImage(value:unknown):ImageRef {
  const image=value as ImageRef;
  if(!image || image.type!=='output' || typeof image.filename!=='string' || typeof image.subfolder!=='string' ||
    !image.filename || /[\\/:\x00]/.test(image.filename) || image.filename.includes('..') ||
    /[\\:\x00]/.test(image.subfolder) || image.subfolder.startsWith('/') || image.subfolder.split('/').includes('..') ||
    !/\.(png|jpe?g|webp)$/i.test(image.filename)) throw new ServiceError('안전하지 않은 결과 이미지 경로입니다.',400);
  return {filename:image.filename,subfolder:image.subfolder,type:'output'};
}
export type Inspection = {state:JobRecord['state'];images:ImageRef[];error?:string};
type History = {outputs?:Record<string,{images?:unknown[]}>;status?:{status_str?:string;completed?:boolean;messages?:[string,Record<string,unknown>][]}};
export function normalizeHistory(raw:unknown):Inspection {
  const history=raw as History;
  if(history.status?.status_str==='error' || history.status?.messages?.some(([type])=>type==='execution_error' || type==='execution_interrupted')) {
    console.error('[ComfyUI generation error]',history.status);
    return {state:'failed',images:[],error:'이미지를 생성하지 못했습니다. 서버 상태나 메모리를 확인한 뒤 다시 시도해 주세요.'};
  }
  const images=Object.values(history.outputs || {}).flatMap(output=>(output.images || []).filter(image=>(image as ImageRef).type==='output').map(safeImage));
  if(history.status?.completed || history.status?.status_str==='success') {
    return images.length ? {state:'completed',images} : {state:'failed',images:[],error:'생성 결과에 저장된 이미지가 없습니다.'};
  }
  return {state:'running',images:[]};
}
export function validateGraphModels(graph:ApiGraph, info:NodeInfo) {
  for(const node of Object.values(graph)) {
    const schema=info[node.class_type];
    if(!schema) throw new ServiceError(`필요한 노드가 없습니다: ${node.class_type}`);
    const inputs={...schema.input.required,...schema.input.optional};
    for(const key of ['unet_name','clip_name','vae_name','lora_name']) {
      if(!(key in node.inputs)) continue;
      const allowed=inputs[key]?.[0];
      if(!Array.isArray(allowed) || !allowed.includes(node.inputs[key])) throw new ServiceError(`필요한 모델 파일이 없습니다: ${String(node.inputs[key])}`);
    }
    for(const key of Object.keys(schema.input.required || {})) {
      if(!(key in node.inputs)) throw new ServiceError(`워크플로 필수 입력이 없습니다: ${node.class_type}.${key}`);
    }
  }
}

type Dependencies = {
  directory:string;
  submit:(input:GenerationInput,id:string)=>Promise<string>;
  inspect:(promptId:string)=>Promise<Inspection>;
  image:(image:ImageRef)=>Promise<Response>;
  recover?:(id:string)=>Promise<string|null>;
};
export function createJobService(deps:Dependencies) {
  const locks=new Map<string,Promise<JobRecord>>();
  const unpersisted=new Map<string,JobRecord>();
  const location=(id:string)=>{assertJobId(id);return path.join(deps.directory,id+'.json');};
  async function read(id:string):Promise<JobRecord> {
    assertJobId(id);
    if(unpersisted.has(id))return unpersisted.get(id)!;
    try {return JSON.parse(await readFile(location(id),'utf8')) as JobRecord;}
    catch(error) {if((error as NodeJS.ErrnoException).code==='ENOENT')throw new ServiceError('작업을 찾을 수 없습니다.',404);throw error;}
  }
  async function save(job:JobRecord) {
    const destination=location(job.id);
    const temp=destination+'.'+randomUUID()+'.tmp';
    await writeFile(temp,JSON.stringify(job),'utf8');
    await rename(temp,destination);
  }
  async function preserveAccepted(job:JobRecord) {
    unpersisted.set(job.id,job);
    for(let attempt=0;attempt<2;attempt++) {
      try{await save(job);unpersisted.delete(job.id);return;}
      catch(error){console.error('[ComfyStudio metadata persistence]',error);}
    }
    // Keep the accepted prompt recoverable in memory; recovery by studio ID also survives a restart.
  }
  async function locked(id:string,operation:()=>Promise<JobRecord>) {
    assertJobId(id);
    const previous=locks.get(id);
    if(previous) await previous.catch(()=>{});
    // Recheck after awaiting: another waiter may have acquired this lock.
    if(locks.has(id)) return locked(id,operation);
    const promise=operation(); locks.set(id,promise);
    try{return await promise;}finally{if(locks.get(id)===promise)locks.delete(id);}
  }
  return {
    async submitGeneration(input:GenerationInput,id:string=randomUUID()):Promise<JobRecord> {
      return locked(id,async()=>{
        await mkdir(deps.directory,{recursive:true});
        const size=getPreset(input.modelId).sizes.find(s=>s.id===input.sizeId)!;
        let job:JobRecord={id,promptId:null,input,createdAt:new Date().toISOString(),state:'submitting',images:[],width:size.width,height:size.height};
        try {await writeFile(location(id),JSON.stringify(job),{encoding:'utf8',flag:'wx'});}
        catch(error) {
          if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
          job=await read(id);
          if(JSON.stringify(job.input)!==JSON.stringify(input))throw new ServiceError('같은 작업 번호로 다른 요청을 보낼 수 없습니다.',409);
          return job;
        }
        let promptId:string;
        try {promptId=await deps.submit(input,id);}
        catch(error) {
          console.error('[ComfyStudio submit]',error);
          const rejected=error instanceof PreparationError||(error instanceof ServiceError&&error.status>=400&&error.status<500);
          job={...job,state:rejected?'failed':'submitting',error:error instanceof ServiceError?error.message:'생성 요청의 접수 상태를 확인하고 있습니다. 같은 작업을 새로 제출하지 않습니다.'};
          await save(job);
          return job;
        }
        job={...job,promptId,state:'queued'};
        await preserveAccepted(job);
        return job;
      });
    },
    async getGeneration(id:string):Promise<JobRecord> {
      return locked(id,async()=>{
        let job=await read(id);
        if(['completed','failed'].includes(job.state))return job;
        if(!job.promptId) {
          const recovered=await deps.recover?.(id);
          if(recovered)job={...job,promptId:recovered,state:'queued',error:undefined};
        }
        if(!job.promptId) {
          if(Date.now()-Date.parse(job.createdAt)>90000) {
            const failed:JobRecord={...job,state:'failed',error:'요청 접수 상태를 확인하지 못했습니다. ComfyUI에서 큐 상태를 확인해 주세요.'};
            await save(failed);return failed;
          }
          return job;
        }
        const inspection=await deps.inspect(job.promptId);
        const updated={...job,...inspection,error:inspection.error};await preserveAccepted(updated);return updated;
      });
    },
    async getGenerationImage(id:string,index:number):Promise<Response> {
      if(!Number.isSafeInteger(index) || index<0)throw new ServiceError('이미지를 찾을 수 없습니다.',404);
      const job=await read(id);
      if(job.state!=='completed' || !job.images[index])throw new ServiceError('이미지를 찾을 수 없습니다.',404);
      return deps.image(safeImage(job.images[index]));
    },
  };
}
