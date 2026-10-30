import {mkdir,unlink} from 'node:fs/promises';import {openAsBlob} from 'node:fs';import path from 'node:path';
import {PreparationError,ServiceError} from '../jobs.ts';import {normalizeVideoHistory} from '../video/jobs.ts';import type {VideoInspection} from '../video/types.ts';import type {ApiGraph,NodeInfo} from '../types.ts';
import {compileSwapWorkflow} from './workflow.ts';import {swapFrames} from './validation.ts';import type {createSwapSources} from './source.ts';import type {SwapInput} from './types.ts';
type Deps={fetch:typeof fetch;translate:(text:string)=>Promise<string>;readWorkflow:()=>Promise<ApiGraph>;reference:(id:string)=>Promise<Uint8Array>;sources:Pick<ReturnType<typeof createSwapSources>,'read'|'prepare'>;base?:string;workDirectory?:string};
export function createSwapClient(deps:Deps){
 const base=(deps.base??'http://127.0.0.1:8188').replace(/\/$/,'');
 async function request(route:string,options:RequestInit={}){let r:Response;try{r=await deps.fetch(base+route,{...options,cache:'no-store',signal:options.signal??AbortSignal.timeout(15000)});}catch{throw new ServiceError('ComfyUI 서버에 연결할 수 없습니다.');}if(!r.ok)throw new ServiceError('ComfyUI가 요청을 처리하지 못했습니다.',r.status>=400&&r.status<500?400:503);return r;}
 async function upload(blob:Blob,name:string){const form=new FormData();form.set('image',blob,name);form.set('subfolder','ComfyStudio/swap');form.set('type','input');form.set('overwrite','true');const uploaded=await(await request('/upload/image',{method:'POST',body:form,signal:AbortSignal.timeout(120000)})).json();if(uploaded.name!==name||uploaded.subfolder!=='ComfyStudio/swap'||uploaded.type!=='input')throw Error('파일 업로드를 확인하지 못했습니다.');return 'ComfyStudio/swap/'+name;}
 const schema=async()=>(await(await request('/object_info')).json()) as NodeInfo;
 return {
  schema,connected:async()=>{await request('/system_stats');return true;},
  async submit(input:SwapInput,id:string){
   let graph:ApiGraph;const directory=deps.workDirectory??path.join(process.cwd(),'.data','swap-work');const clip=path.join(directory,id+'.mp4');
   try{
    await mkdir(directory,{recursive:true});const info=await schema(),raw=await deps.readWorkflow(),source=await deps.sources.read(input.sourceId),frames=swapFrames(input.durationSeconds);
    const canvas=await deps.sources.prepare(source,frames,clip);
    const description=await deps.translate(input.description);
    const sourceFile=await upload(await openAsBlob(clip,{type:'video/mp4'}),id+'.mp4');
    const referenceFile=await upload(new Blob([new Uint8Array(await deps.reference(input.referenceId))],{type:'image/png'}),id+'.png');
    graph=compileSwapWorkflow(raw,{target:input.target,description,sourceFile,referenceFile,frames,...canvas},info);
   }catch(e){throw new PreparationError(e instanceof Error?e.message:'인물 교체 준비를 완료하지 못했습니다.');}
   finally{await unlink(clip).catch(()=>{});}
   const result=await(await request('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:graph,client_id:id,extra_data:{comfy_studio_swap_job_id:id}})})).json();
   if(typeof result.prompt_id!=='string')throw new ServiceError('작업 번호를 확인하지 못했습니다.');return result.prompt_id as string;
  },
  async inspect(id:string):Promise<VideoInspection>{
   const route='/history/'+encodeURIComponent(id);let h=await(await request(route)).json();if(h[id])return normalizeVideoHistory(h[id]);
   const q=await(await request('/queue')).json();if(q.queue_running.some((r:unknown[])=>r[1]===id))return {state:'running'};if(q.queue_pending.some((r:unknown[])=>r[1]===id))return {state:'queued'};
   h=await(await request(route)).json();return h[id]?normalizeVideoHistory(h[id]):{state:'failed',error:'서버에서 작업을 찾을 수 없습니다.'};
  },
  async recover(id:string):Promise<string|null>{
   const q=await(await request('/queue')).json();const match=[...q.queue_running,...q.queue_pending].find((r:unknown[])=>(r[3] as Record<string,unknown>)?.comfy_studio_swap_job_id===id);if(match&&typeof match[1]==='string')return match[1];
   const history=await(await request('/history?max_items=100')).json() as Record<string,{prompt?:unknown[]}>;return Object.entries(history).find(([,h])=>(h.prompt?.[3] as Record<string,unknown>)?.comfy_studio_swap_job_id===id)?.[0]??null;
  },
 };
}
