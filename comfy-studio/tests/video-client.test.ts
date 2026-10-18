import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createVideoClient} from '../lib/video/client.ts';
const fixture=async(name:string)=>JSON.parse(await readFile(new URL('./fixtures/video/'+name+'.json',import.meta.url),'utf8'));
test('video client translates before submission, uploads real references, and rejects translation before queuing',async()=>{
 const schema=await fixture('node-info'),raw=await fixture('image');let fail=false;const graphs:Record<string,{class_type:string;inputs:Record<string,unknown>}>[]=[];
 const client=createVideoClient({fetch:async(url,options)=>{
  const route=new URL(String(url)).pathname;
  if(route==='/object_info')return Response.json(schema);
  if(route==='/upload/image')return Response.json({name:'11111111-1111-4111-8111-111111111111.png',subfolder:'ComfyStudio/references',type:'input'});
  if(route==='/prompt'){graphs.push(JSON.parse(String(options?.body)).prompt);return Response.json({prompt_id:'accepted'});}
  throw new Error('Unexpected request '+route);
 },translate:async()=>{if(fail)throw Error('Translation down');return 'A red mug';},readWorkflow:async()=>raw,reference:async()=>new Uint8Array([1,2,3])});
 const input={mode:'image' as const,prompt:'빨간 컵',resolution:'480p' as const,durationSeconds:7,referenceId:'11111111-1111-4111-8111-111111111111'};
 assert.equal(await client.submit(input,'11111111-1111-4111-8111-111111111111'),'accepted');
 assert.equal(Object.values(graphs[0]).find(n=>n.class_type==='MiniMaxH3ImageToVideo')?.inputs.prompt,'A red mug');
 fail=true;await assert.rejects(()=>client.submit(input,'11111111-1111-4111-8111-111111111111'));assert.equal(graphs.length,1);assert.equal(input.prompt,'빨간 컵');
});

test('later enhancement uploads only the saved original video and queues no base sampler',async()=>{
 const schema=await fixture('node-info'),raw=await fixture('text'),sourceId='22222222-2222-4222-8222-222222222222';let graph:Record<string,{class_type:string;inputs:Record<string,unknown>}>={},uploads=0;
 const client=createVideoClient({fetch:async(url,options)=>{const route=new URL(String(url)).pathname;
  if(route==='/object_info')return Response.json(schema);
  if(route==='/view'){assert.match(String(url),/original.mp4/);return new Response('saved-video',{headers:{'content-type':'video/mp4'}});}
  if(route==='/upload/image'){uploads++;const body=options!.body as FormData;assert.equal((body.get('image') as File).type,'video/mp4');assert.equal((body.get('image') as File).name,sourceId+'.mp4');return Response.json({name:sourceId+'.mp4',subfolder:'ComfyStudio/video-sources',type:'input'});}
  if(route==='/prompt'){graph=JSON.parse(String(options?.body)).prompt;return Response.json({prompt_id:'enhance-only'});}throw Error(route);
 },translate:async()=> 'A mug',readWorkflow:async mode=>{assert.equal(mode,'text');return raw;},reference:async()=>{throw Error('Reference image must not be re-uploaded');},source:async id=>{assert.equal(id,sourceId);return {filename:'original.mp4',subfolder:'video',type:'output'};}});
 const input={mode:'image' as const,prompt:'원문',resolution:'720p' as const,durationSeconds:7,upscale:'ai' as const,sourceJobId:sourceId,referenceId:'11111111-1111-4111-8111-111111111111'};
 assert.equal(await client.submit(input,'33333333-3333-4333-8333-333333333333'),'enhance-only');assert.equal(uploads,1);assert.ok(!Object.values(graph).some(n=>n.class_type==='SamplerCustomAdvanced'));assert.equal(input.prompt,'원문');
});
