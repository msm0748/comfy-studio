import {withVideoRealism} from '../realism.ts';
import type {VideoInput,VideoMode,VideoModel,VideoInspection,VideoOutputRef} from './types.ts';import type {NodeInfo} from '../types.ts';
import {PreparationError,ServiceError,assertJobId} from '../jobs.ts';import {compileVideoWorkflow,compileVideoEnhancement} from './workflow.ts';import {normalizeVideoHistory,safeVideoOutput} from './jobs.ts';
import {mkdir,unlink} from 'node:fs/promises';import {createWriteStream,openAsBlob} from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {Readable,Transform} from 'node:stream';import {pipeline} from 'node:stream/promises';
type Deps={fetch:typeof fetch;translate:(prompt:string)=>Promise<string>;readWorkflow:(mode:VideoMode,model?:VideoModel)=>Promise<unknown>;reference:(id:string)=>Promise<Uint8Array>;source?:(id:string)=>Promise<VideoOutputRef>;base?:string};
export function createVideoClient(deps:Deps){
 const base=(deps.base??'http://127.0.0.1:8188').replace(/\/$/,'');
 async function request(route:string,options:RequestInit={}){let r:Response;try{r=await deps.fetch(base+route,{...options,cache:'no-store',signal:options.signal??AbortSignal.timeout(15000)});}catch{throw new ServiceError('ComfyUI 영상 서버에 연결할 수 없습니다.');}if(!r.ok)throw new ServiceError('ComfyUI가 영상 요청을 처리하지 못했습니다.',r.status>=400&&r.status<500?400:503);return r;}
 async function uploadSource(sourceId:string){assertJobId(sourceId);if(!deps.source)throw new Error('원본 영상 조회를 구성해 주세요.');const ref=safeVideoOutput(await deps.source(sourceId));
  const directory=path.join(process.cwd(),'.data','video-uploads');await mkdir(directory,{recursive:true});const file=path.join(directory,randomUUID()+'.mp4');
  try{const response=await request('/view?'+new URLSearchParams(ref),{signal:AbortSignal.timeout(120000)});if(!response.body||!response.headers.get('content-type')?.toLowerCase().startsWith('video/mp4')){await response.body?.cancel();throw Error('보정할 원본 영상을 읽지 못했습니다.');}
   let bytes=0;const limited=new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;done(bytes>512*1024*1024?Error('원본 영상 파일이 너무 큽니다.'):null,chunk);}});await pipeline(Readable.fromWeb(response.body as never),limited,createWriteStream(file,{flags:'wx'}));
   const form=new FormData();form.set('image',await openAsBlob(file,{type:'video/mp4'}),sourceId+'.mp4');form.set('subfolder','ComfyStudio/video-sources');form.set('type','input');form.set('overwrite','true');const uploaded=await(await request('/upload/image',{method:'POST',body:form,signal:AbortSignal.timeout(120000)})).json();if(uploaded.name!==sourceId+'.mp4'||uploaded.subfolder!=='ComfyStudio/video-sources'||uploaded.type!=='input')throw Error('원본 영상 업로드를 확인하지 못했습니다.');
  }finally{await unlink(file).catch(()=>{});}
 }
 const schema=async()=>(await(await request('/object_info')).json()) as NodeInfo;
 return {
  schema,
  connected:async()=>{await request('/system_stats');return true;},
  async submit(input:VideoInput,id:string){
   let graph;
   try{
    const info=await schema(),raw=await deps.readWorkflow(input.sourceJobId?'text':input.mode,input.model);
    // Validate before uploading/translation so unsupported templates never consume a paid translation.
    const filename=input.referenceId?`ComfyStudio/references/${input.referenceId}.png`:undefined;
    const sourceFilename=input.sourceJobId?`ComfyStudio/video-sources/${input.sourceJobId}.mp4`:undefined;
    if(sourceFilename)compileVideoEnhancement(raw,input,info,sourceFilename);else compileVideoWorkflow(raw,input,info,filename);
    const translated=withVideoRealism(await deps.translate(input.prompt),input.model);
    if(input.sourceJobId)await uploadSource(input.sourceJobId);
    else if(input.referenceId){const form=new FormData();form.set('image',new Blob([new Uint8Array(await deps.reference(input.referenceId))],{type:'image/png'}),input.referenceId+'.png');form.set('subfolder','ComfyStudio/references');form.set('type','input');form.set('overwrite','true');const uploaded=await(await request('/upload/image',{method:'POST',body:form})).json();if(uploaded.name!==input.referenceId+'.png'||uploaded.subfolder!=='ComfyStudio/references'||uploaded.type!=='input')throw Error('참조 이미지 업로드를 확인하지 못했습니다.');}
    graph=sourceFilename?compileVideoEnhancement(raw,{...input,prompt:translated},info,sourceFilename):compileVideoWorkflow(raw,{...input,prompt:translated},info,filename);
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
