import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {createVideoEncoder,createVideoFinalizer} from '../lib/video/encoding.ts';import {createPendingVideo} from '../lib/video/submission.ts';
test('Full HD encoder shares concurrent work, preserves audio arguments and reuses completed output',async()=>{
 await mkdir('.data/test-tmp',{recursive:true});const directory=await mkdtemp(path.resolve('.data/test-tmp/encode-'));const id=randomUUID();let runs=0;
 const encoder=createVideoEncoder({directory,fetch:async()=>new Response('source',{headers:{'content-type':'video/mp4'}}),run:async(_exe,args)=>{runs++;assert.match(args[args.indexOf('-vf')+1],/scale=1920:1080:.*flags=lanczos/);assert.equal(args[args.indexOf('-c:a')+1],'copy');await writeFile(args.at(-1)!,'encoded');}});
 try{const source={filename:'x.mp4',subfolder:'video',type:'output' as const};const [a,b]=await Promise.all([encoder.encode(id,source),encoder.encode(id,source)]);assert.deepEqual(a,b);assert.equal(runs,1);assert.deepEqual(await encoder.encode(id,source),a);assert.equal(runs,1);}finally{await rm(directory,{recursive:true,force:true});}
});

test('fast 720p uses CPU Lanczos while later AI720 copies video and original audio',async()=>{
 await mkdir('.data/test-tmp',{recursive:true});const directory=await mkdtemp(path.resolve('.data/test-tmp/encode-'));const source={filename:'source.mp4',subfolder:'video',type:'output' as const};let mode='fast',downloads=0;
 const encoder=createVideoEncoder({directory,fetch:async()=>{downloads++;return new Response('source',{headers:{'content-type':'video/mp4'}});},run:async(_exe,args)=>{if(mode==='fast'){assert.match(args[args.indexOf('-vf')+1],/scale=1280:720:.*flags=lanczos/);assert.ok(!args.includes('-hwaccel'));}else{assert.equal(args.includes('-vf'),false);assert.equal(args[args.indexOf('-c:v')+1],'copy');assert.ok(args.includes('1:a?'));}await writeFile(args.at(-1)!,'encoded');}});
 try{await encoder.encode(randomUUID(),source,{resolution:'720p'});mode='ai';await encoder.encode(randomUUID(),source,{resolution:'720p',copyVideo:true,audioSource:{...source,filename:'original.mp4'}});assert.equal(downloads,3);}finally{await rm(directory,{recursive:true,force:true});}
});

test('finalization retains legacy AI behavior and routes new fast output or source audio explicitly',async()=>{
 const source={filename:'source.mp4',subfolder:'video',type:'output' as const},original={...source,filename:'original.mp4'};const calls:unknown[][]=[];
 const finish=createVideoFinalizer({encode:async(...args:unknown[])=>{calls.push(args);return {kind:'local' as const,filename:'output.mp4'};}});
 const pending=createPendingVideo({mode:'text',prompt:'x',durationSeconds:7,resolution:'720p'});const {model:_model,...legacyInput}=pending.input;void _model;const base={...pending,input:legacyInput,sourceOutput:source};
 assert.deepEqual(await finish(base),{kind:'comfy',ref:source});assert.equal(calls.length,0);
 await finish({...base,input:{...base.input,upscale:'fast'}});assert.equal((calls[0][2] as {resolution:string}).resolution,'720p');
 await finish({...base,input:{...base.input,upscale:'ai',sourceJobId:randomUUID()},originalOutput:original});assert.deepEqual((calls[1][2] as {audioSource:unknown}).audioSource,original);assert.equal((calls[1][2] as {copyVideo:boolean}).copyVideo,true);
});

test('portrait encoding scales to portrait size',async()=>{
 await mkdir('.data/test-tmp',{recursive:true});const directory=await mkdtemp(path.resolve('.data/test-tmp/encode-'));
 const encoder=createVideoEncoder({directory,fetch:async()=>new Response('source',{headers:{'content-type':'video/mp4'}}),run:async(_exe,args)=>{assert.match(args[args.indexOf('-vf')+1],/scale=1080:1920:.*crop=1080:1920/);await writeFile(args.at(-1)!,'encoded');}});
 try{await encoder.encode(randomUUID(),{filename:'x.mp4',subfolder:'video',type:'output'},{resolution:'1080p',aspect:'portrait'});}finally{await rm(directory,{recursive:true,force:true});}
});
