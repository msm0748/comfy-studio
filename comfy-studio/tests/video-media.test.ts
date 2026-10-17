import test from 'node:test';import assert from 'node:assert/strict';import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {createVideoMediaService} from '../lib/video/media.ts';import type {VideoJobRecord} from '../lib/video/types.ts';
test('local video supports exact ranges and HEAD while rejecting traversal and incomplete jobs',async()=>{
 await mkdir('.data/test-tmp',{recursive:true});const directory=await mkdtemp(path.resolve('.data/test-tmp/media-')),id=randomUUID();await writeFile(path.join(directory,id+'.mp4'),Buffer.from('0123456789'));
 const job={id,state:'completed',media:{kind:'local',filename:id+'.mp4'}} as VideoJobRecord;const media=createVideoMediaService({directory});
 try{
  for(const [range,status,body,contentRange] of [['bytes=2-5',206,'2345','bytes 2-5/10'],['bytes=-3',206,'789','bytes 7-9/10'],['bytes=7-',206,'789','bytes 7-9/10'],['bytes=99-',416,'','bytes */10'],['bytes=0-1,3-4',416,'','bytes */10']] as const){const r=await media.serve(job,new Request('http://localhost/video',{headers:{Range:range}}));assert.equal(r.status,status);assert.equal(await r.text(),body);assert.equal(r.headers.get('content-range'),contentRange);}
  const head=await media.serve(job,new Request('http://localhost/video',{method:'HEAD'}));assert.equal(head.headers.get('content-length'),'10');assert.equal(await head.text(),'');
  await assert.rejects(()=>media.serve({...job,state:'running'},new Request('http://localhost/video')));
  await assert.rejects(()=>media.serve({...job,media:{kind:'local',filename:'../secret'}},new Request('http://localhost/video')));
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('remote video forwards Range with cancellation signal and preserves 206 headers',async()=>{
 const controller=new AbortController();let forwarded:AbortSignal|null|undefined;const media=createVideoMediaService({fetch:async(_url,options)=>{assert.equal(new Headers(options?.headers).get('range'),'bytes=0-2');forwarded=options?.signal;return new Response('abc',{status:206,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 0-2/10','Content-Length':'3'}});}});
 const response=await media.serve({state:'completed',media:{kind:'comfy',ref:{filename:'x.mp4',subfolder:'video',type:'output'}}} as VideoJobRecord,new Request('http://localhost/video',{headers:{range:'bytes=0-2'},signal:controller.signal}));assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 0-2/10');assert.equal(await response.text(),'abc');controller.abort();assert.equal(forwarded?.aborted,true);
});
