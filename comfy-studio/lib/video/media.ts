import {createReadStream} from 'node:fs';import {stat} from 'node:fs/promises';import {Readable} from 'node:stream';import path from 'node:path';
import {ServiceError,assertJobId} from '../jobs.ts';import {safeVideoOutput} from './jobs.ts';import type {VideoJobRecord} from './types.ts';
export function createVideoMediaService(overrides:{directory?:string;fetch?:typeof fetch;base?:string}={}){
 const directory=overrides.directory??path.join(process.cwd(),'.data','video-media'),request=overrides.fetch??fetch,base=overrides.base??process.env.COMFYUI_URL??'http://127.0.0.1:8188';
 return {async serve(job:VideoJobRecord,input:Request):Promise<Response>{
  if(job.state!=='completed'||!job.media)throw new ServiceError('완성된 영상을 찾을 수 없습니다.',404);
  const headers=new Headers({'Content-Type':'video/mp4','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Content-Disposition':`inline; filename="comfy-studio-${job.id??'video'}.mp4"`});
  const range=input.headers.get('range');
  if(job.media.kind==='comfy'){
   const ref=safeVideoOutput(job.media.ref);
   if(range&&!/^bytes=(\d+-\d*|-\d+)$/.test(range))return new Response(null,{status:416,headers});
   const upstream=await request(base.replace(/\/$/,'')+'/view?'+new URLSearchParams(ref),{method:input.method==='HEAD'?'HEAD':'GET',headers:range?{Range:range}:{},signal:input.signal,cache:'no-store'});
   if(![200,206,416].includes(upstream.status)){await upstream.body?.cancel();throw new ServiceError('영상 파일을 읽지 못했습니다.',502);}
   if(upstream.status!==416&&!upstream.headers.get('content-type')?.toLowerCase().startsWith('video/mp4')){await upstream.body?.cancel();throw new ServiceError('영상 파일 형식을 확인하지 못했습니다.',502);}
   for(const key of ['content-length','content-range','accept-ranges'])if(upstream.headers.has(key))headers.set(key,upstream.headers.get(key)!);
   return new Response(input.method==='HEAD'?null:upstream.body,{status:upstream.status,headers});
  }
  assertJobId(job.id);if(job.media.filename!==job.id+'.mp4')throw new ServiceError('안전하지 않은 영상 파일입니다.',400);
  // Generated media exists only at runtime; exclude it from build dependency tracing.
  const file=path.join(/*turbopackIgnore: true*/ directory,job.media.filename);let size:number;try{size=(await stat(/*turbopackIgnore: true*/ file)).size;}catch{throw new ServiceError('영상 파일을 찾을 수 없습니다.',404);}
  let start=0,end=size-1,status=200;
  if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{...Object.fromEntries(headers),'Content-Range':`bytes */${size}`}});
   if(!m[1]){const suffix=Number(m[2]);start=Math.max(0,size-suffix);if(suffix<=0)start=size;}else{start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),size-1):size-1;}
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return new Response(null,{status:416,headers:{...Object.fromEntries(headers),'Content-Range':`bytes */${size}`}});
   status=206;headers.set('Content-Range',`bytes ${start}-${end}/${size}`);
  }
  headers.set('Content-Length',String(Math.max(0,end-start+1)));
  if(input.method==='HEAD')return new Response(null,{status,headers});
  const stream=createReadStream(/*turbopackIgnore: true*/ file,{start,end,signal:input.signal});return new Response(Readable.toWeb(stream) as ReadableStream,{status,headers});
 }};
}
