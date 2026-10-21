import path from 'node:path';import {readFile,access} from 'node:fs/promises';
import {translatePrompt} from '../translate-prompt.ts';import {references} from '../reference-images.ts';import {ServiceError} from '../jobs.ts';
import {createVideoClient} from './client.ts';import {createVideoJobService,safeVideoOutput} from './jobs.ts';import {loadVideoWorkflow,compileVideoWorkflow,compileVideoEnhancement} from './workflow.ts';import {finalizeVideo} from './encoding.ts';import {createVideoMediaService} from './media.ts';import {VIDEO_PRESETS,videoMaxSeconds} from './presets.ts';import {createEnhancementInput,originalVideoRef} from './upscale.ts';import type {VideoAvailability,VideoInput,VideoMode,VideoUpscale,VideoResolution} from './types.ts';
const client=createVideoClient({fetch:(...args)=>fetch(...args),translate:translatePrompt,readWorkflow:loadVideoWorkflow,reference:id=>references.image(id),source:async id=>{const ref=originalVideoRef(await jobs.read(id));if(!ref)throw new ServiceError('원본 영상을 찾을 수 없습니다.',404);return safeVideoOutput(ref);},base:process.env.COMFYUI_URL});
const jobs=createVideoJobService({directory:path.join(process.cwd(),'.data','video-jobs'),submit:client.submit,inspect:client.inspect,recover:client.recover,finalize:finalizeVideo});
const media=createVideoMediaService();
type Verified=Partial<Record<VideoMode,Partial<Record<string,{verified:boolean;maxSeconds:number}>>>>;
async function verified(upscale:VideoUpscale):Promise<Verified>{try{const saved=JSON.parse(await readFile(path.join(process.cwd(),'.data','video-capabilities.json'),'utf8'));return saved[upscale]??(upscale==='ai'?saved:{});}catch{return {};}}
export async function getVideoAvailability(upscale:VideoUpscale='fast'):Promise<VideoAvailability>{
 const validation=process.env.STUDIO_VIDEO_VALIDATION_MODE==='1',caps=await verified(upscale);
 let info;try{await client.connected();info=await client.schema();}catch{return {connected:false,modes:(['text','image'] as const).map(id=>({id,available:false,reason:'ComfyUI 연결을 확인해 주세요.',presets:VIDEO_PRESETS.map(p=>({...p,available:false,verified:false}))}))};}
 const modes=[];
 for(const mode of ['text','image'] as const){
  let raw:unknown,loadError='';try{raw=await loadVideoWorkflow(mode);}catch{loadError='저장된 영상 워크플로를 찾을 수 없습니다.';}
  const presets=[];
  for(const p of VIDEO_PRESETS){const limit=videoMaxSeconds(p.id,upscale),certification=caps[mode]?.[p.id];const isVerified=certification?.verified===true&&Number.isInteger(certification.maxSeconds)&&certification.maxSeconds>=5&&certification.maxSeconds<=limit;const maxSeconds=isVerified?certification!.maxSeconds:limit;let reason=loadError;
   if(upscale==='ai'&&p.id==='480p')reason='AI 보정은 720p 또는 1080p 출력에서 선택해 주세요.';
   if(!reason)try{const input:VideoInput={mode,prompt:'Video availability check',resolution:p.id,durationSeconds:maxSeconds,upscale,...(mode==='image'?{referenceId:'11111111-1111-4111-8111-111111111111'}:{})};compileVideoWorkflow(raw,input,info,mode==='image'?'ComfyStudio/references/11111111-1111-4111-8111-111111111111.png':undefined);if(upscale==='ai')compileVideoEnhancement(await loadVideoWorkflow('text'),{...input,sourceJobId:'11111111-1111-4111-8111-111111111111'},info,'ComfyStudio/video-sources/11111111-1111-4111-8111-111111111111.mp4');if(p.id!=='480p')await access(process.env.STUDIO_FFMPEG_PATH??'C:/ComfyUI/ComfyUI_windows_portable/python_embeded/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');}catch(e){reason=e instanceof Error?e.message:'영상 처리 구성을 확인해 주세요.';}
   if(!reason&&!isVerified&&!validation)reason='이 출력 설정은 PC 실측 검증을 기다리고 있습니다.';
   presets.push({...p,maxSeconds,available:!reason,verified:isVerified,...(reason?{reason}:{})});
  }
  modes.push({id:mode,available:presets.some(p=>p.available),presets});
 }
 return {connected:true,upscale,modes};
}
export async function submitVideo(input:VideoInput,id:string){
 try{await jobs.read(id);return jobs.submit(input,id);}catch(e){if(!(e instanceof ServiceError)||e.status!==404)throw e;}
 let originalOutput;
 if(input.sourceJobId){const source=await jobs.read(input.sourceJobId),canonical=createEnhancementInput(source,input.resolution);if(input.mode!==canonical.mode||input.prompt!==canonical.prompt||input.durationSeconds!==canonical.durationSeconds||input.referenceId!==canonical.referenceId||input.upscale!=='ai')throw new ServiceError('원본 영상의 보정 설정이 일치하지 않습니다.',400);
 input=canonical;originalOutput=safeVideoOutput(originalVideoRef(source)!);}
 const availability=await getVideoAvailability(input.upscale??'fast'),preset=availability.modes.find(m=>m.id===input.mode)?.presets.find(p=>p.id===input.resolution);
 if(!preset?.available)throw new ServiceError(preset?.reason??'영상 모델에 연결할 수 없습니다.',503);
 if(input.durationSeconds>preset.maxSeconds)throw new ServiceError(`이 PC에서 검증된 최대 길이는 ${preset.maxSeconds}초입니다.`,400);
 return jobs.submit(input,id,{originalOutput});
}
export async function enhanceVideo(sourceId:string,resolution:VideoResolution,id:string){return submitVideo(createEnhancementInput(await jobs.read(sourceId),resolution),id);}
export const getVideoJob=jobs.get;
export const retryVideoFinalization=jobs.retryFinalization;
export const getVideoRecord=jobs.read;
export async function getVideoMedia(id:string,request:Request){return media.serve(await jobs.read(id),request);}
export async function getVideoOriginalMedia(id:string,request:Request){const job=await jobs.read(id),ref=originalVideoRef(job);if(!ref||job.state!=='completed')throw new ServiceError('완성된 원본 영상을 찾을 수 없습니다.',404);return media.serve({...job,media:{kind:'comfy',ref:safeVideoOutput(ref)}},request);}
