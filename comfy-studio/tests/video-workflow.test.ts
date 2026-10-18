import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {compileVideoWorkflow,compileVideoEnhancement} from '../lib/video/workflow.ts';
import type {NodeInfo} from '../lib/types.ts';
const fixture=async(name:string)=>JSON.parse(await readFile(new URL('./fixtures/video/'+name+'.json',import.meta.url),'utf8'));
const schema:NodeInfo=await fixture('node-info');

test('changed widget schema order fails before an invalid workflow can be submitted',async()=>{
 const changed=structuredClone(schema),fields=changed.BasicScheduler.input.required!;
 changed.BasicScheduler.input.required={model:fields.model,scheduler:fields.scheduler,denoise:fields.denoise,steps:fields.steps};
 const raw=await fixture('text');
 assert.throws(()=>compileVideoWorkflow(raw,{mode:'text',prompt:'x',resolution:'480p',durationSeconds:7},changed),/스키마|입력/);
});
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
  const graph=compileVideoWorkflow(await fixture('text'),{mode:'text',prompt:'A mug',resolution,durationSeconds:7,upscale:'ai'},schema);
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
 const raw=await fixture('text');assert.throws(()=>compileVideoWorkflow(raw,{mode:'text',prompt:'x',resolution:'720p',durationSeconds:7,upscale:'ai'},missing));
});

test('fast high-resolution generation keeps native output without AI upscale or refinement',async()=>{
 for(const resolution of ['720p','1080p'] as const){const graph=compileVideoWorkflow(await fixture('text'),{mode:'text',prompt:'A mug',resolution,durationSeconds:7},schema);const nodes=Object.values(graph);assert.ok(!nodes.some(n=>/Upscaler|SplitUpscale|ImageCrop/.test(n.class_type)));assert.equal(nodes.filter(n=>n.class_type==='SaveVideo').length,1);assert.match(String(nodes.find(n=>n.class_type==='SaveVideo')!.inputs.filename_prefix),/original/);}
});

test('immediate AI output also saves the original before refinement',async()=>{
 const graph=compileVideoWorkflow(await fixture('text'),{mode:'text',prompt:'A mug',resolution:'720p',durationSeconds:7,upscale:'ai'},schema);
 assert.equal(graph.studio_original_save.class_type,'SaveVideo');assert.ok(graph.studio_original_decode);assert.equal(Object.values(graph).filter(n=>n.class_type==='SaveVideo').length,2);const original=graph.studio_original_decode.inputs.samples as [string,number];assert.equal(graph[original[0]].class_type,'SamplerCustomAdvanced');assert.deepEqual(graph.studio_original_video.inputs.images,['studio_original_decode',0]);
});

test('later AI enhancement encodes the saved video and never runs the original generation sampler',async()=>{
 const input={mode:'text' as const,prompt:'A mug',resolution:'720p' as const,durationSeconds:7,upscale:'ai' as const,sourceJobId:'11111111-1111-4111-8111-111111111111'};
 const file='ComfyStudio/video-sources/'+input.sourceJobId+'.mp4';const graph=compileVideoEnhancement(await fixture('text'),input,schema,file),nodes=Object.values(graph);
 assert.ok(nodes.some(n=>n.class_type==='LoadVideo'&&n.inputs.file===file));assert.ok(nodes.some(n=>n.class_type==='VAEEncodeTiled'));assert.ok(nodes.some(n=>n.class_type==='VAEEncodeAudio'));assert.ok(!nodes.some(n=>n.class_type==='SamplerCustomAdvanced'));assert.equal(nodes.filter(n=>n.class_type==='SaveVideo').length,1);assert.equal(graph.studio_original_save,undefined);
 assert.deepEqual(nodes.find(n=>n.class_type==='CreateVideo')!.inputs.audio,['studio_source_components',1]);assert.throws(()=>compileVideoEnhancement(awaitless(),input,schema,'../x.mp4'));
 function awaitless(){return {};}
});
