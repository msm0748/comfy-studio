import path from 'node:path';
import { getPreset, listPresetDefinitions } from './presets.ts';
import { compileWorkflow, loadWorkflow } from './workflow.ts';
import { createJobService, normalizeHistory, ServiceError, validateGraphModels } from './jobs.ts';
import { compileEditWorkflow,loadEditWorkflow } from './edit-workflow.ts';
import { references } from './reference-images.ts';
import type { ApiGraph, GenerationInput, ImageRef, ModelOption, NodeInfo } from './types.ts';

const base=()=> (process.env.COMFYUI_URL || 'http://127.0.0.1:8188').replace(/\/$/,'');
async function request(route:string,options:RequestInit={}) {
  let response:Response;
  try {response=await fetch(base()+route,{...options,cache:'no-store',signal:AbortSignal.timeout(15000)});}
  catch(error) {console.error('[ComfyUI connection]',error);throw new ServiceError('ComfyUI에 연결할 수 없습니다. PC의 ComfyUI 실행 상태를 확인해 주세요.');}
  if(!response.ok) {console.error('[ComfyUI response]',route,response.status,await response.text());throw new ServiceError('ComfyUI가 요청을 처리하지 못했습니다. 저장된 워크플로를 확인해 주세요.',response.status>=400&&response.status<500?400:503);}
  return response;
}
let schemaCache:{expires:number;value:NodeInfo}|undefined;
async function nodeInfo():Promise<NodeInfo> {
  if(schemaCache && schemaCache.expires>Date.now())return schemaCache.value;
  const value=await (await request('/object_info')).json() as NodeInfo;
  schemaCache={expires:Date.now()+15000,value};return value;
}
async function prepared(input:GenerationInput,info?:NodeInfo,referenceFilename?:string):Promise<ApiGraph> {
  const preset=getPreset(input.modelId);
  const schema=info || await nodeInfo();
  if(preset.mode==='edit')return compileEditWorkflow(await loadEditWorkflow(),input,referenceFilename??`ComfyStudio/references/${input.referenceId}.png`,schema);
  const graph=compileWorkflow(preset,await loadWorkflow(preset),input,schema);
  validateGraphModels(graph,schema);return graph;
}
export async function getModelOptions():Promise<{connected:boolean;models:ModelOption[]}> {
  const presets=listPresetDefinitions();
  let info:NodeInfo;
  try{await request('/system_stats');info=await nodeInfo();}catch{return {connected:false,models:presets.map(p=>({...p,available:false,reason:'ComfyUI 연결을 확인해 주세요.'}))};}
  const models=await Promise.all(presets.map(async preset=>{
    try {await prepared({modelId:preset.id,prompt:'availability check',sizeId:'square',...(preset.mode==='edit'?{referenceId:'11111111-1111-4111-8111-111111111111'}:{})},info);return {...preset,available:true};}
    catch(error){console.error('[ComfyStudio preset]',preset.id,error);return {...preset,available:false,reason:error instanceof Error?error.message:'워크플로를 확인해 주세요.'};}
  }));
  return {connected:true,models};
}
async function submit(input:GenerationInput,id:string) {
  const filename=input.referenceId?await uploadReference(input.referenceId):undefined;
  const prompt=await prepared(input,undefined,filename);
  const data=await (await request('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,client_id:id,extra_data:{comfy_studio_job_id:id}})})).json();
  if(typeof data.prompt_id!=='string')throw new ServiceError('ComfyUI가 작업 번호를 반환하지 않았습니다.');
  return data.prompt_id as string;
}
async function inspect(promptId:string) {
  const route='/history/'+encodeURIComponent(promptId);
  let history=await (await request(route)).json();
  if(history[promptId])return normalizeHistory(history[promptId]);
  const queue=await (await request('/queue')).json() as {queue_running:unknown[][];queue_pending:unknown[][]};
  if(queue.queue_running.some(row=>row[1]===promptId))return {state:'running' as const,images:[]};
  if(queue.queue_pending.some(row=>row[1]===promptId))return {state:'queued' as const,images:[]};
  history=await (await request(route)).json();
  if(history[promptId])return normalizeHistory(history[promptId]);
  return {state:'failed' as const,images:[],error:'서버에서 작업을 찾을 수 없습니다. ComfyUI가 재시작되었거나 작업이 취소됐을 수 있습니다.'};
}
async function image(ref:ImageRef) {
  const query=new URLSearchParams(ref);
  const response=await request('/view?'+query);
  if(!response.headers.get('content-type')?.startsWith('image/'))throw new ServiceError('이미지 응답을 확인할 수 없습니다.');
  return new Response(response.body,{headers:{'Content-Type':response.headers.get('content-type')!,'Cache-Control':'no-store','Content-Disposition':`inline; filename="${ref.filename.replace(/[^a-zA-Z0-9_.-]/g,'_')}"`,'X-Content-Type-Options':'nosniff'}});
}
async function recover(id:string):Promise<string|null> {
  const queue=await (await request('/queue')).json() as {queue_running:unknown[][];queue_pending:unknown[][]};
  const match=[...queue.queue_running,...queue.queue_pending].find(row=>(row[3] as Record<string,unknown>)?.comfy_studio_job_id===id);
  if(match&&typeof match[1]==='string')return match[1];
  const history=await (await request('/history?max_items=100')).json() as Record<string,{prompt?:unknown[]}>;
  const entry=Object.entries(history).find(([,value])=>(value.prompt?.[3] as Record<string,unknown>)?.comfy_studio_job_id===id);
  return entry?.[0] || null;
}
const service=createJobService({directory:path.join(process.cwd(),'.data','jobs'),submit,inspect,image,recover});
async function uploadReference(id:string):Promise<string>{
  const bytes=await references.image(id);const form=new FormData();
  form.set('image',new Blob([new Uint8Array(bytes)],{type:'image/png'}),id+'.png');form.set('subfolder','ComfyStudio/references');form.set('type','input');form.set('overwrite','true');
  const result=await(await request('/upload/image',{method:'POST',body:form})).json();
  if(result.name!==id+'.png'||result.subfolder!=='ComfyStudio/references'||result.type!=='input')throw new ServiceError('참조 이미지 전송 결과를 확인하지 못했습니다.',400);
  return `ComfyStudio/references/${id}.png`;
}
export async function submitGeneration(input:GenerationInput,id:string){
  if(getPreset(input.modelId).mode==='edit'){
    if(!input.referenceId)throw new ServiceError('참조 이미지를 선택해 주세요.',400);
    await references.get(input.referenceId);
    try{await prepared(input);}catch(error){throw new ServiceError(error instanceof Error?error.message:'편집 모델을 확인해 주세요.',400);}
  }
  return service.submitGeneration(input,id);
}
export const getGeneration=service.getGeneration;
export const getGenerationImage=service.getGenerationImage;
