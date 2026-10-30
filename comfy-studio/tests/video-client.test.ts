import {withVideoRealism} from '../lib/realism.ts';
import test from 'node:test';import assert from 'node:assert/strict';
import {createVideoClient} from '../lib/video/client.ts';import {videoSchema} from './video-schema.ts';
test('video client translates before submission, uploads real references, and rejects translation before queuing',async()=>{
 const schema=await videoSchema();let fail=false;const graphs:Record<string,{class_type:string;inputs:Record<string,unknown>}>[]=[];
 const client=createVideoClient({fetch:async(url,options)=>{
  const route=new URL(String(url)).pathname;
  if(route==='/object_info')return Response.json(schema);
  if(route==='/upload/image')return Response.json({name:'11111111-1111-4111-8111-111111111111.png',subfolder:'ComfyStudio/references',type:'input'});
  if(route==='/prompt'){graphs.push(JSON.parse(String(options?.body)).prompt);return Response.json({prompt_id:'accepted'});}
  throw new Error('Unexpected request '+route);
 },translate:async()=>{if(fail)throw Error('Translation down');return 'A red mug';},reference:async()=>new Uint8Array([1,2,3])});
 const input={mode:'image' as const,prompt:'빨간 컵',resolution:'720p' as const,durationSeconds:7,referenceId:'11111111-1111-4111-8111-111111111111'};
 assert.equal(await client.submit(input,'11111111-1111-4111-8111-111111111111'),'accepted');
 assert.ok(Object.values(graphs[0]).filter(n=>n.class_type==='MiniMaxH3ImageToVideo').every(n=>n.inputs.prompt===withVideoRealism('A red mug')));
 fail=true;await assert.rejects(()=>client.submit(input,'11111111-1111-4111-8111-111111111111'));assert.equal(graphs.length,1);assert.equal(input.prompt,'빨간 컵');
});
