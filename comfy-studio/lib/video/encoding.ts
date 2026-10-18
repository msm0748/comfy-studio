import {mkdir,stat,rename,unlink} from 'node:fs/promises';import {createWriteStream} from 'node:fs';import {pipeline} from 'node:stream/promises';import {Readable,Transform} from 'node:stream';import path from 'node:path';import {randomUUID} from 'node:crypto';import {spawn} from 'node:child_process';
import {assertJobId,ServiceError} from '../jobs.ts';import {safeVideoOutput} from './jobs.ts';import type {VideoJobRecord,VideoMedia,VideoOutputRef} from './types.ts';
import {getVideoPreset} from './presets.ts';import {recordVideoUpscale} from './upscale.ts';import type {VideoResolution} from './types.ts';
const defaultFFmpeg='C:/ComfyUI/ComfyUI_windows_portable/python_embeded/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';
function runEncoder(exe:string,args:string[]):Promise<void>{return new Promise((resolve,reject)=>{const child=spawn(exe,args,{shell:false,windowsHide:true,stdio:['ignore','ignore','ignore']});const timer=setTimeout(()=>{child.kill();reject(new Error('영상 인코딩 시간 초과'));},15*60*1000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error('영상 인코딩 실패'));});});}
export function createVideoEncoder(overrides:{directory?:string;fetch?:typeof fetch;run?:(exe:string,args:string[])=>Promise<void>;base?:string;executable?:string}={}){
 const directory=overrides.directory??path.join(process.cwd(),'.data','video-media'),request=overrides.fetch??fetch,run=overrides.run??runEncoder,base=overrides.base??process.env.COMFYUI_URL??'http://127.0.0.1:8188';const locks=new Map<string,Promise<VideoMedia>>();
 return {async encode(id:string,source:VideoOutputRef,options:{resolution?:VideoResolution;copyVideo?:boolean;audioSource?:VideoOutputRef}={}):Promise<VideoMedia>{assertJobId(id);source=safeVideoOutput(source);if(options.audioSource)options={...options,audioSource:safeVideoOutput(options.audioSource)};const preset=getVideoPreset(options.resolution??'1080p');const previous=locks.get(id);if(previous)return previous;
  const operation=(async():Promise<VideoMedia>=>{
   await mkdir(directory,{recursive:true});const filename=id+'.mp4',destination=path.join(directory,filename);try{if((await stat(destination)).size>0)return {kind:'local',filename};}catch{}
   const attempt=id+'.'+randomUUID(),original=path.join(directory,attempt+'.source.mp4'),audio=path.join(directory,attempt+'.audio.mp4'),temp=path.join(directory,attempt+'.tmp.mp4');
   try{
    async function download(ref:VideoOutputRef,file:string){const response=await request(base.replace(/\/$/,'')+'/view?'+new URLSearchParams(ref),{signal:AbortSignal.timeout(120000)});if(!response.ok||!response.body||!response.headers.get('content-type')?.toLowerCase().startsWith('video/mp4'))throw new ServiceError('확대할 원본 영상을 읽지 못했습니다.');let bytes=0;const limited=new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;done(bytes>512*1024*1024?new Error('영상 파일이 너무 큽니다.'):null,chunk);}});await pipeline(Readable.fromWeb(response.body as never),limited,createWriteStream(file,{flags:'wx'}));}
    await download(source,original);if(options.audioSource)await download(options.audioSource,audio);
    const videoOptions=options.copyVideo?['-c:v','copy']:['-vf',`scale=${preset.width}:${preset.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${preset.width}:${preset.height},setsar=1`,'-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p'];
    await run(overrides.executable??process.env.STUDIO_FFMPEG_PATH??defaultFFmpeg,['-nostdin','-y','-i',original,...(options.audioSource?['-i',audio]:[]),'-map','0:v:0','-map',options.audioSource?'1:a?':'0:a?',...videoOptions,'-c:a','copy','-movflags','+faststart',temp]);
    if((await stat(temp)).size===0)throw Error('Empty output');await rename(temp,destination);return {kind:'local',filename};
   }finally{await Promise.allSettled([original,audio,temp].map(file=>unlink(file)));}
  })();locks.set(id,operation);try{return await operation;}finally{locks.delete(id);}
 }};
}
const encoder=createVideoEncoder();
export function createVideoFinalizer(output:Pick<typeof encoder,'encode'>){return async(job:VideoJobRecord):Promise<VideoMedia>=>{
 if(!job.sourceOutput)throw new ServiceError('원본 영상을 찾을 수 없습니다.');
 const fast=recordVideoUpscale(job)==='fast',later=!!job.input.sourceJobId;
 if(later&&!job.originalOutput)throw new ServiceError('오디오를 보존할 원본 영상을 찾을 수 없습니다.');
 if(job.input.resolution==='1080p'||(fast&&job.input.resolution==='720p')||later)return output.encode(job.id,job.sourceOutput,{resolution:job.input.resolution,copyVideo:later&&job.input.resolution==='720p',...(later?{audioSource:job.originalOutput}:{} )});
 return {kind:'comfy',ref:safeVideoOutput(job.sourceOutput)};
};}
export const finalizeVideo=createVideoFinalizer(encoder);
