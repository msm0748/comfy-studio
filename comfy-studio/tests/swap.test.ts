import test from 'node:test';import assert from 'node:assert/strict';
import {validateSwapInput,swapCanvas,swapFrames} from '../lib/swap/validation.ts';import {compileSwapWorkflow,swapPrompt} from '../lib/swap/workflow.ts';import {parseProbe} from '../lib/swap/source.ts';
import {initialTrim,moveTrim,trimLength} from '../lib/swap/trim.ts';
import type {ApiGraph,NodeInfo} from '../lib/types.ts';
const id='11111111-1111-4111-8111-111111111111';
const input={sourceId:id,referenceId:id,description:'갈색 카디건',durationSeconds:15,target:'all',consent:true};
test('swap input requires consent and allows 5 to 15 seconds on the H3 grid',()=>{
 assert.equal(validateSwapInput(input).durationSeconds,15);assert.deepEqual([5,10,12.3,15].map(swapFrames),[124,243,294,362]);
 for(const change of [{consent:false},{durationSeconds:15.1},{startSeconds:1},{durationSeconds:4},{description:' '},{target:'x'},{sourceId:'../x'},{extra:1}])assert.throws(()=>validateSwapInput({...input,...change}));
});
test('canvas follows source orientation on the 32-pixel grid',()=>{for(const [w,h,e] of [[1280,720,[864,480]],[720,1280,[480,864]],[1000,1000,[672,672]]] as const){const c=swapCanvas(w,h);assert.deepEqual([c.width,c.height],e);assert.equal(c.width%32+c.height%32,0);}});
test('probe reads size, duration, audio and phone rotation',()=>{
 const text='Duration: 00:01:02.50, start: 0\n  Stream #0:0: Video: h264 (High), yuv420p, 1920x1080, 30 fps\n  displaymatrix: rotation of -90.00 degrees\n  Stream #0:1: Audio: aac';
 assert.deepEqual(parseProbe(text),{width:1080,height:1920,durationSeconds:62.5,hasAudio:true});assert.equal(parseProbe('nonsense'),null);
});
const graph=():ApiGraph=>{const n=(class_type:string,inputs:Record<string,unknown>={})=>({class_type,inputs});return {source:n('LoadVideo',{file:'x'}),reference:n('LoadImage',{image:'x'}),prepare:n('H3RelayPrepareSource',{video:['source',0]}),adapter:n('LoraLoaderModelOnly',{lora_name:'old'}),plan:n('H3RelayWindowPlan',{source_frames:['prepare',5],seed:1}),window:n('H3RelayWindowInputs',{source:['prepare',0],source_audio:['prepare',1],mask:['expand_mask',0]}),reference_conditioning:n('MiniMaxH3ReferenceToVideo',{prompt:'x'}),save:n('SaveVideo',{filename_prefix:'x'}),mask_preview:n('PreviewImage',{images:['expand_mask',1]}),expand_mask:n('H3RelayExpandMask',{images:['prepare',0],source_frames:['prepare',5]}),recover:n('H3RelayRecoverMasks'),mask:n('SAM3_TrackToMask'),track:n('SAM3_VideoTrack'),select:n('H3RelaySelectMask'),detect:n('SAM3_Detect'),subject:n('CLIPTextEncode'),first_frame:n('ImageFromBatch'),sam:n('CheckpointLoaderSimple',{ckpt_name:'sam3.1_multiplex_fp16.safetensors'})};};
const info=new Proxy({LoraLoaderModelOnly:{input:{required:{lora_name:[['h3-v2-challenge-eval-20261013\\v2-1000.safetensors']]}}},CheckpointLoaderSimple:{input:{required:{ckpt_name:[['sam3.1_multiplex_fp16.safetensors']]}}}} as NodeInfo,{get:(t,k:string)=>t[k]??{input:{required:{}}}});
const options={description:'a brown cardigan',sourceFile:'s.mp4',referenceFile:'r.png',width:864,height:480,frames:362};
test('whole-frame swap drops tracking and removes the ffprobe node',()=>{
 const g=compileSwapWorkflow(graph(),{...options,target:'all'},info);
 assert.ok(!g.prepare&&!g.sam&&!g.detect&&!g.mask_preview);assert.deepEqual(g.window.inputs.mask,['studio_mask',0]);assert.deepEqual(g.window.inputs.source,['studio_components',0]);assert.deepEqual(g.plan.inputs.source_frames,['studio_frames',0]);assert.equal(g.studio_frames.inputs.value,362);assert.equal(g.studio_mask_batch.inputs.amount,362);assert.equal(g.adapter.inputs.lora_name,'h3-v2-challenge-eval-20261013\\v2-1000.safetensors');assert.match(String(g.reference_conditioning.inputs.prompt),/every person.*a brown cardigan/);
});
test('single-person swap keeps tracking and needs SAM',()=>{
 const g=compileSwapWorkflow(graph(),{...options,target:'one'},info);
 assert.deepEqual(g.window.inputs.mask,['expand_mask',0]);assert.deepEqual(g.expand_mask.inputs.images,['studio_components',0]);assert.match(swapPrompt('one','x.'),/the selected person.*: x\. Keep/);
 const noSam=new Proxy({LoraLoaderModelOnly:info.LoraLoaderModelOnly} as NodeInfo,{get:(t,k:string)=>t[k]??{input:{required:{}}}});assert.throws(()=>compileSwapWorkflow(graph(),{...options,target:'one'},noSam),/SAM/);
});
test('every dragged range yields a length the server accepts',()=>{
 for(const duration of [5,5.04,14.97,15.1,222.54])for(let i=0;i<4000;i++){let range=initialTrim(duration);for(const kind of ['end','start','both'] as const){range=moveTrim(range,kind,i*0.073%duration,duration);swapFrames(trimLength(range));assert.ok(range.start>=0&&range.end<=duration+0.1,JSON.stringify({duration,kind,range}));}}
});
test('trim range stays within 5 to 15 seconds and the video bounds',()=>{
 assert.deepEqual(initialTrim(100),{start:0,end:15});assert.deepEqual(initialTrim(7.26),{start:0,end:7.3});
 assert.deepEqual(moveTrim({start:0,end:15},'end',60,100),{start:45,end:60});
 assert.deepEqual(moveTrim({start:45,end:60},'start',10,100),{start:10,end:25});
 assert.deepEqual(moveTrim({start:10,end:20},'end',12,100),{start:7,end:12});
 assert.deepEqual(moveTrim({start:10,end:20},'start',18,100),{start:18,end:23});
 assert.deepEqual(moveTrim({start:10,end:20},'both',95,100),{start:90,end:100});
 assert.deepEqual(moveTrim({start:90,end:100},'start',99,100),{start:95,end:100});
});
