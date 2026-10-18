import path from 'node:path';import {readFile,access} from 'node:fs/promises';
import {translatePrompt} from '../translate-prompt.ts';import {references} from '../reference-images.ts';import {ServiceError} from '../jobs.ts';
import {createVideoClient} from './client.ts';import {createVideoJobService} from './jobs.ts';import {loadVideoWorkflow,compileVideoWorkflow} from './workflow.ts';import {finalizeVideo} from './encoding.ts';import {createVideoMediaService} from './media.ts';import {VIDEO_PRESETS} from './presets.ts';import type {VideoAvailability,VideoInput,VideoMode} from './types.ts';
const client=createVideoClient({fetch:(...args)=>fetch(...args),translate:translatePrompt,readWorkflow:loadVideoWorkflow,reference:id=>references.image(id),base:process.env.COMFYUI_URL});
const jobs=createVideoJobService({directory:path.join(process.cwd(),'.data','video-jobs'),submit:client.submit,inspect:client.inspect,recover:client.recover,finalize:finalizeVideo});
const media=createVideoMediaService();
type Verified=Partial<Record<VideoMode,Partial<Record<string,{verified:boolean;maxSeconds:number}>>>>;
async function verified():Promise<Verified>{try{return JSON.parse(await readFile(path.join(process.cwd(),'.data','video-capabilities.json'),'utf8'));}catch{return {};}}
export async function getVideoAvailability():Promise<VideoAvailability>{
 const validation=process.env.STUDIO_VIDEO_VALIDATION_MODE==='1',caps=await verified();
 let info;try{await client.connected();info=await client.schema();}catch{return {connected:false,modes:(['text','image'] as const).map(id=>({id,available:false,reason:'ComfyUI 연결을 확인해 주세요.',presets:VIDEO_PRESETS.map(p=>({...p,available:false,verified:false}))}))};}
 const modes=[];
 for(const mode of ['text','image'] as const){
  let raw:unknown,loadError='';try{raw=await loadVideoWorkflow(mode);}catch{loadError='저장된 영상 워크플로를 찾을 수 없습니다.';}
  const presets=[];
  for(const p of VIDEO_PRESETS){const certification=caps[mode]?.[p.id];const isVerified=certification?.verified===true&&Number.isInteger(certification.maxSeconds)&&certification.maxSeconds>=5&&certification.maxSeconds<=p.maxSeconds;const maxSeconds=isVerified?certification!.maxSeconds:p.maxSeconds;let reason=loadError;
   if(!reason)try{compileVideoWorkflow(raw,{mode,prompt:'Video availability check',resolution:p.id,durationSeconds:maxSeconds,...(mode==='image'?{referenceId:'11111111-1111-4111-8111-111111111111'}:{})},info,mode==='image'?'ComfyStudio/references/11111111-1111-4111-8111-111111111111.png':undefined);if(p.id==='1080p')await access(process.env.STUDIO_FFMPEG_PATH??'C:/ComfyUI/ComfyUI_windows_portable/python_embeded/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');}catch(e){reason=e instanceof Error?e.message:'영상 처리 구성을 확인해 주세요.';}
   if(!reason&&!isVerified&&!validation)reason='이 출력 설정은 PC 실측 검증을 기다리고 있습니다.';
   presets.push({...p,maxSeconds,available:!reason,verified:isVerified,...(reason?{reason}:{})});
  }
  modes.push({id:mode,available:presets.some(p=>p.available),presets});
 }
 return {connected:true,modes};
}
export async function submitVideo(input:VideoInput,id:string){
 try{await jobs.read(id);return jobs.submit(input,id);}catch(e){if(!(e instanceof ServiceError)||e.status!==404)throw e;}
 const availability=await getVideoAvailability(),preset=availability.modes.find(m=>m.id===input.mode)?.presets.find(p=>p.id===input.resolution);
 if(!preset?.available)throw new ServiceError(preset?.reason??'영상 모델에 연결할 수 없습니다.',503);
 if(input.durationSeconds>preset.maxSeconds)throw new ServiceError(`이 PC에서 검증된 최대 길이는 ${preset.maxSeconds}초입니다.`,400);
 return jobs.submit(input,id);
}
export const getVideoJob=jobs.get;
export const retryVideoFinalization=jobs.retryFinalization;
export const getVideoRecord=jobs.read;
export async function getVideoMedia(id:string,request:Request){return media.serve(await jobs.read(id),request);}
