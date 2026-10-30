import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {validateVideoInput} from '../lib/video/validation.ts';import {compileVideoWorkflow,loadVideoWorkflow,SINGULARITY_UNET} from '../lib/video/workflow.ts';import {createEnhancementInput,videoOutputDescription} from '../lib/video/upscale.ts';import {createPendingVideo} from '../lib/video/submission.ts';import {createVideoFinalizer} from '../lib/video/encoding.ts';
import type {NodeInfo} from '../lib/types.ts';import type {VideoJobRecord} from '../lib/video/types.ts';
const schema:NodeInfo=JSON.parse(await readFile(new URL('./fixtures/video/node-info.json',import.meta.url),'utf8'));
const options=(type:string,key:string)=>schema[type].input.required![key][0] as string[];
options('UNETLoader','unet_name').push(SINGULARITY_UNET);options('LoraLoaderModelOnly','lora_name').push('minimax_h3_ref2v_lightx2v_turbo_4step_v0.1_resized_avg_rank_20_bf16.safetensors');
schema.ModelAttentionBackend={input:{required:{model:['MODEL'],attention:[['pytorch attention','comfy kitchen attention']]}}} as never;
schema.MiniMaxH3SigmaShift={input:{required:{model:['MODEL'],shift_video:['FLOAT'],shift_audio:['FLOAT']}}} as never;
schema.ManualSigmas={input:{required:{sigmas:['STRING']}}} as never;
const input={mode:'text' as const,prompt:'A mug',resolution:'720p' as const,durationSeconds:10,model:'singularity' as const};
const reference='11111111-1111-4111-8111-111111111111';
test('Singularity is opt-in, needs an upscaled output and refuses separate AI refinement',()=>{
 assert.equal(validateVideoInput(input).model,'singularity');
 assert.throws(()=>validateVideoInput({...input,resolution:'480p'}),/720p/);
 assert.throws(()=>validateVideoInput({...input,durationSeconds:7,upscale:'ai'}),/AI 보정/);
 assert.throws(()=>validateVideoInput({...input,durationSeconds:11}));
});
test('Singularity runs two passes at 864x480 and 1280x736 and saves 720p with audio',async()=>{
 assert.equal(await loadVideoWorkflow('text','singularity'),null);
 const graph=compileVideoWorkflow(null,input,schema),nodes=Object.values(graph);
 const conditions=nodes.filter(n=>n.class_type==='MiniMaxH3ImageToVideo');
 assert.deepEqual(conditions.map(n=>[n.inputs.width,n.inputs.height,n.inputs.length]),[[864,480,243],[1280,736,243]]);
 assert.ok(conditions.every(n=>n.inputs.first_frame===undefined&&n.inputs.prompt==='A mug'));
 assert.equal(nodes.filter(n=>n.class_type==='SamplerCustomAdvanced').length,2);
 assert.deepEqual(graph.refine.inputs.guider,['refine_guider',0]);assert.deepEqual(graph.refine.inputs.latent_image,['upscaled',0]);
 assert.equal(graph.unet.inputs.unet_name,SINGULARITY_UNET);assert.equal(graph.crop.inputs.height,720);assert.deepEqual(graph.video.inputs.audio,['audio',0]);
 assert.equal(nodes.filter(n=>n.class_type==='SaveVideo').length,1);
});
test('image mode center-crops the same first frame for each pass so photos are not stretched',()=>{
 const filename=`ComfyStudio/references/${reference}.png`;
 const graph=compileVideoWorkflow(null,{...input,mode:'image',referenceId:reference},schema,filename);
 assert.equal(graph.image.inputs.image,filename);
 for(const [condition,frame,width,height] of [['base_condition','base_frame',864,480],['refine_condition','refine_frame',1280,736]] as const){
  assert.deepEqual(graph[condition].inputs.first_frame,[frame,0]);
  assert.deepEqual(graph[frame].inputs,{image:['image',0],upscale_method:'lanczos',width,height,crop:'center'});
 }
 assert.throws(()=>compileVideoWorkflow(null,{...input,mode:'image',referenceId:reference},schema,'../evil.png'));
});
test('a missing Singularity model file blocks the graph',()=>{
 const missing=structuredClone(schema);missing.UNETLoader.input.required!.unet_name[0]=[];
 assert.throws(()=>compileVideoWorkflow(null,input,missing),/모델 파일/);
});
const done=(resolution:'720p'|'1080p'):VideoJobRecord=>{const output={filename:'a.mp4',subfolder:'ComfyStudio/video',type:'output' as const};return {...createPendingVideo({...input,resolution,durationSeconds:5,upscale:'fast'}),state:'completed',sourceOutput:output,originalOutput:output};};
test('finished Singularity videos skip re-encoding at 720p, encode 1080p and offer no AI refinement',async()=>{
 const calls:string[]=[];const finalize=createVideoFinalizer({encode:async(_id,_source,o)=>{calls.push(String(o?.resolution));return {kind:'local',filename:'x.mp4'};}});
 assert.equal((await finalize(done('720p'))).kind,'comfy');assert.equal((await finalize(done('1080p'))).kind,'local');assert.deepEqual(calls,['1080p']);
 assert.throws(()=>createEnhancementInput(done('720p'),'1080p'),/이미 포함/);
 assert.match(videoOutputDescription(done('720p').input),/AI 업스케일 포함/);assert.match(videoOutputDescription(done('1080p').input),/Lanczos/);
});
