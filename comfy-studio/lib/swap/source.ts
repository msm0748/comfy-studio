import {createWriteStream} from 'node:fs';import {mkdir,readFile,rename,unlink,writeFile} from 'node:fs/promises';import {spawn} from 'node:child_process';import path from 'node:path';import {randomUUID} from 'node:crypto';import {Readable,Transform} from 'node:stream';import {pipeline} from 'node:stream/promises';
import {ServiceError} from '../jobs.ts';import {isSwapId,SWAP_MAX_SECONDS,SWAP_MIN_SECONDS,swapCanvas} from './validation.ts';import type {SwapSource} from './types.ts';
export const MAX_SOURCE_BYTES=500*1024*1024;
// The browser uploads only the trimmed range plus a short tail; this rejects anything that skipped the trimmer.
export const MAX_SOURCE_SECONDS=SWAP_MAX_SECONDS+1;
const FFMPEG='C:/ComfyUI/ComfyUI_windows_portable/python_embeded/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';
export function parseProbe(text:string):Pick<SwapSource,'width'|'height'|'durationSeconds'|'hasAudio'>|null{
 const duration=/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text),line=text.split(/\r?\n/).find(l=>/Stream #.*Video:/.test(l)),size=line&&/\b(\d{2,5})x(\d{2,5})\b/.exec(line);if(!duration||!size)return null;
 const rotated=/rotation of -?(90|270)/.test(text);const a=Number(size[1]),b=Number(size[2]);
 return {width:rotated?b:a,height:rotated?a:b,durationSeconds:Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3]),hasAudio:/Stream #.*Audio:/.test(text)};
}
function run(args:string[]):Promise<{code:number|null;stderr:string}>{return new Promise((resolve,reject)=>{const child=spawn(process.env.STUDIO_FFMPEG_PATH??FFMPEG,args,{shell:false,windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',chunk=>{if(stderr.length<65536)stderr+=chunk;});const timer=setTimeout(()=>{child.kill();reject(new Error('영상 처리 시간 초과'));},5*60*1000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);resolve({code,stderr});});});}
export function createSwapSources(directory=path.join(process.cwd(),'.data','swap-sources')){
 const video=(id:string)=>{if(!isSwapId(id))throw new ServiceError('원본 영상을 확인해 주세요.',400);return path.join(directory,id+'.video');};
 return {
  async save(body:ReadableStream<Uint8Array>):Promise<SwapSource>{
   await mkdir(directory,{recursive:true});const id=randomUUID(),file=video(id),temp=file+'.tmp';let bytes=0;
   const limited=new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;done(bytes>MAX_SOURCE_BYTES?new ServiceError('영상은 500MB 이하로 올려 주세요.',413):null,chunk);}});
   try{await pipeline(Readable.fromWeb(body as never),limited,createWriteStream(temp,{flags:'wx'}));
    const probe=parseProbe((await run(['-hide_banner','-i',temp])).stderr);if(!probe)throw new ServiceError('영상 파일을 읽지 못했습니다.',400);
    if(probe.durationSeconds<SWAP_MIN_SECONDS-0.1||probe.durationSeconds>MAX_SOURCE_SECONDS)throw new ServiceError(`원본 구간은 ${SWAP_MIN_SECONDS}~${SWAP_MAX_SECONDS}초여야 합니다.`,400);
    const source:SwapSource={id,...probe,createdAt:new Date().toISOString()};await rename(temp,file);await writeFile(file+'.json',JSON.stringify(source),'utf8');return source;
   }catch(e){await unlink(temp).catch(()=>{});throw e;}
  },
  async read(id:string):Promise<SwapSource>{const file=video(id);try{return JSON.parse(await readFile(file+'.json','utf8'));}catch{throw new ServiceError('원본 영상을 찾을 수 없습니다. 다시 올려 주세요.',404);}},
  // Normalizes one clip to the 24 fps, 32-pixel-aligned canvas the swap workflow expects.
  // The grid can exceed the clip by a fraction of a second, so the last frame and silence fill that gap.
  async prepare(source:SwapSource,frames:number,destination:string):Promise<{width:number;height:number}>{
   if(frames/24>source.durationSeconds+0.5)throw new ServiceError('원본 구간이 선택한 길이보다 짧습니다. 다시 잘라 주세요.',400);
   const canvas=swapCanvas(source.width,source.height);
   const args=['-nostdin','-y','-i',video(source.id),...(source.hasAudio?[]:['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']),'-map','0:v:0','-map',source.hasAudio?'0:a:0':'1:a:0','-vf',`fps=24,scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${canvas.width}:${canvas.height},setsar=1,tpad=stop_mode=clone:stop_duration=1`,'-af','apad','-frames:v',String(frames),'-t',(frames/24).toFixed(6),'-c:v','libx264','-crf','12','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k',destination];
   const {code}=await run(args);if(code!==0)throw new Error('원본 영상을 준비하지 못했습니다.');return canvas;
  },
 };
}
