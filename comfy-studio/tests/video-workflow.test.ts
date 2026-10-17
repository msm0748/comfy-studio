import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {compileVideoWorkflow} from '../lib/video/workflow.ts';
import type {NodeInfo} from '../lib/types.ts';
const fixture=async(name:string)=>JSON.parse(await readFile(new URL('./fixtures/video/'+name+'.json',import.meta.url),'utf8'));
const schema:NodeInfo=await fixture('node-info');
test('video graph binds prompt and frames; optional image is absent for text and genuine for image',async()=>{
 const input={mode:'text' as const,prompt:'A red mug',resolution:'480p' as const,durationSeconds:10};
 const graph=compileVideoWorkflow(await fixture('text'),input,schema);
 const nodes=Object.values(graph);const h3=nodes.find(n=>n.class_type==='MiniMaxH3ImageToVideo')!;
 assert.deepEqual([h3.inputs.width,h3.inputs.height,h3.inputs.length,h3.inputs.prompt],[864,480,243,input.prompt]);
 assert.equal(h3.inputs.first_frame,undefined);assert.ok(!nodes.some(n=>/Upscaler|Lora/.test(n.class_type)));
 assert.ok(nodes.some(n=>n.class_type==='VAEDecodeAudio'));
 const image=compileVideoWorkflow(await fixture('image'),{...input,mode:'image',referenceId:'11111111-1111-4111-8111-111111111111'},schema,'ComfyStudio/references/11111111-1111-4111-8111-111111111111.png');
 assert.ok(Object.values(image).find(n=>n.class_type==='MiniMaxH3ImageToVideo')!.inputs.first_frame);
 assert.throws(()=>compileVideoWorkflow(awaitless(),{...input,mode:'image'},schema,'../evil.png'));
 function awaitless(){return {};}
});
test('high outputs upscale only video latent then refine with chunks, retaining original audio and fps',async()=>{
 for(const resolution of ['720p','1080p'] as const){
  const graph=compileVideoWorkflow(await fixture('text'),{mode:'text',prompt:'A mug',resolution,durationSeconds:7},schema);
  const nodes=Object.values(graph);
  assert.equal(nodes.find(n=>n.class_type==='MiniMaxH3ImageToVideo')!.inputs.width,864);
  const up=nodes.find(n=>n.class_type==='MinimaxH3LatentUpscaler3D')!;
  assert.ok(up.inputs.enable_temporal_chunking);assert.ok(up.inputs.force_unload);
  assert.equal(up.inputs['mode.width'],1280);assert.equal(up.inputs['mode.height'],736);
  assert.ok(nodes.some(n=>n.class_type==='MMH3SplitUpscale'));
  assert.ok(nodes.some(n=>n.class_type==='VAEDecodeTiled'));
  assert.equal(nodes.find(n=>n.class_type==='ImageCrop')!.inputs.height,720);
  assert.equal(nodes.find(n=>n.class_type==='CreateVideo')!.inputs.fps,24);
  assert.equal(nodes.find(n=>n.class_type==='SaveVideo')!.inputs.format,'mp4');
  const audio=nodes.find(n=>n.class_type==='VAEDecodeAudio')!;
  assert.ok(!String(audio.inputs.samples).includes('refined'));
 }
 const missing=structuredClone(schema);delete missing.MMH3SplitUpscale;
 const raw=await fixture('text');assert.throws(()=>compileVideoWorkflow(raw,{mode:'text',prompt:'x',resolution:'720p',durationSeconds:7},missing));
});
