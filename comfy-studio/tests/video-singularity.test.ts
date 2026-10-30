import test from 'node:test';import assert from 'node:assert/strict';
import {compileVideoWorkflow,SINGULARITY_UNET} from '../lib/video/workflow.ts';import {videoOutputDescription} from '../lib/video/upscale.ts';import {createPendingVideo,videoFormInput} from '../lib/video/submission.ts';import {createVideoFinalizer} from '../lib/video/encoding.ts';
import {videoSchema} from './video-schema.ts';import type {VideoJobRecord} from '../lib/video/types.ts';
const schema=await videoSchema();
const input={mode:'text' as const,prompt:'A mug',resolution:'720p' as const,durationSeconds:10};
const reference='11111111-1111-4111-8111-111111111111';
test('every video runs two passes at 864x480 and 1280x736 and saves 720p with audio',()=>{
 const graph=compileVideoWorkflow(input,schema),nodes=Object.values(graph);
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
 const graph=compileVideoWorkflow({...input,mode:'image',referenceId:reference},schema,filename);
 assert.equal(graph.image.inputs.image,filename);
 for(const [condition,frame,width,height] of [['base_condition','base_frame',864,480],['refine_condition','refine_frame',1280,736]] as const){
  assert.deepEqual(graph[condition].inputs.first_frame,[frame,0]);
  assert.deepEqual(graph[frame].inputs,{image:['image',0],upscale_method:'lanczos',width,height,crop:'center'});
 }
 assert.throws(()=>compileVideoWorkflow({...input,mode:'image',referenceId:reference},schema,'../evil.png'));
});
test('a missing model file or upscaler blocks the graph',()=>{
 const missing=structuredClone(schema);missing.UNETLoader.input.required!.unet_name[0]=[];
 assert.throws(()=>compileVideoWorkflow(input,missing),/모델 파일/);
 const noUpscaler=structuredClone(schema);noUpscaler.MinimaxH3LatentUpscaler3D.input.required!.model_name=[[]] as never;
 assert.throws(()=>compileVideoWorkflow(input,noUpscaler),/업스케일/);
});
const done=(resolution:'720p'|'1080p'):VideoJobRecord=>{const output={filename:'a.mp4',subfolder:'ComfyStudio/video',type:'output' as const};return {...createPendingVideo({...input,model:'singularity',resolution,durationSeconds:5,upscale:'fast'}),state:'completed',sourceOutput:output,originalOutput:output};};
test('finished videos skip re-encoding at 720p and encode 1080p',async()=>{
 const calls:string[]=[];const finalize=createVideoFinalizer({encode:async(_id,_source,o)=>{calls.push(String(o?.resolution));return {kind:'local',filename:'x.mp4'};}});
 assert.equal((await finalize(done('720p'))).kind,'comfy');assert.equal((await finalize(done('1080p'))).kind,'local');assert.deepEqual(calls,['1080p']);
 assert.match(videoOutputDescription(done('720p').input),/AI 업스케일 포함/);assert.match(videoOutputDescription(done('1080p').input),/Lanczos/);
});
test('a restored older job fills the form only with settings that still apply',()=>{
 assert.deepEqual(videoFormInput({mode:'image',prompt:'컵',resolution:'480p',durationSeconds:7,upscale:'ai',model:'fasth3',referenceId:reference,sourceJobId:reference}),{mode:'image',prompt:'컵',resolution:'720p',durationSeconds:7,referenceId:reference});
 assert.equal(videoFormInput({...input,resolution:'1080p'}).resolution,'1080p');
});
