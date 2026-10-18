import type {VideoInput,VideoMode,VideoInspection} from './types.ts';import type {NodeInfo} from '../types.ts';
import {PreparationError,ServiceError} from '../jobs.ts';import {compileVideoWorkflow} from './workflow.ts';import {normalizeVideoHistory} from './jobs.ts';
type Deps={fetch:typeof fetch;translate:(prompt:string)=>Promise<string>;readWorkflow:(mode:VideoMode)=>Promise<unknown>;reference:(id:string)=>Promise<Uint8Array>;base?:string};
export function createVideoClient(deps:Deps){
 const base=(deps.base??'http://127.0.0.1:8188').replace(/\/$/,'');
 async function request(route:string,options:RequestInit={}){let r:Response;try{r=await deps.fetch(base+route,{...options,cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{throw new ServiceError('ComfyUI 영상 서버에 연결할 수 없습니다.');}if(!r.ok)throw new ServiceError('ComfyUI가 영상 요청을 처리하지 못했습니다.',r.status>=400&&r.status<500?400:503);return r;}
 const schema=async()=>(await(await request('/object_info')).json()) as NodeInfo;
 return {
  schema,
  connected:async()=>{await request('/system_stats');return true;},
  async submit(input:VideoInput,id:string){
   let graph;
   try{
    const info=await schema(),raw=await deps.readWorkflow(input.mode);
    // Validate before uploading/translation so unsupported templates never consume a paid translation.
    const filename=input.referenceId?`ComfyStudio/references/${input.referenceId}.png`:undefined;
    compileVideoWorkflow(raw,input,info,filename);
    const translated=await deps.translate(input.prompt);
    if(input.referenceId){const form=new FormData();form.set('image',new Blob([new Uint8Array(await deps.reference(input.referenceId))],{type:'image/png'}),input.referenceId+'.png');form.set('subfolder','ComfyStudio/references');form.set('type','input');form.set('overwrite','true');const uploaded=await(await request('/upload/image',{method:'POST',body:form})).json();if(uploaded.name!==input.referenceId+'.png'||uploaded.subfolder!=='ComfyStudio/references'||uploaded.type!=='input')throw Error('참조 이미지 업로드를 확인하지 못했습니다.');}
    graph=compileVideoWorkflow(raw,{...input,prompt:translated},info,filename);
   }catch(e){throw new PreparationError(e instanceof Error?e.message:'영상 준비를 완료하지 못했습니다.');}
   const result=await(await request('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:graph,client_id:id,extra_data:{comfy_studio_video_job_id:id}})})).json();
   if(typeof result.prompt_id!=='string')throw new ServiceError('영상 생성 번호를 확인하지 못했습니다.');return result.prompt_id as string;
  },
  async inspect(id:string):Promise<VideoInspection>{
   const route='/history/'+encodeURIComponent(id);let h=await(await request(route)).json();if(h[id])return normalizeVideoHistory(h[id]);
   const q=await(await request('/queue')).json();if(q.queue_running.some((r:unknown[])=>r[1]===id))return {state:'running'};if(q.queue_pending.some((r:unknown[])=>r[1]===id))return {state:'queued'};
   h=await(await request(route)).json();return h[id]?normalizeVideoHistory(h[id]):{state:'failed',error:'서버에서 영상 작업을 찾을 수 없습니다.'};
  },
  async recover(id:string):Promise<string|null>{
   const q=await(await request('/queue')).json();const match=[...q.queue_running,...q.queue_pending].find((r:unknown[])=>(r[3] as Record<string,unknown>)?.comfy_studio_video_job_id===id);if(match&&typeof match[1]==='string')return match[1];
   const history=await(await request('/history?max_items=100')).json() as Record<string,{prompt?:unknown[]}>;return Object.entries(history).find(([,h])=>(h.prompt?.[3] as Record<string,unknown>)?.comfy_studio_video_job_id===id)?.[0]??null;
  },
 };
}
