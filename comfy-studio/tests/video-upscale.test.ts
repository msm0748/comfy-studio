import test from 'node:test';import assert from 'node:assert/strict';
import {createEnhancementInput,originalVideoRef,recordVideoUpscale} from '../lib/video/upscale.ts';import {createPendingVideo} from '../lib/video/submission.ts';
const original={filename:'original.mp4',subfolder:'ComfyStudio/video',type:'output' as const};
test('legacy outputs keep their meaning while later enhancement retains original input and identity',()=>{
 const parent={...createPendingVideo({mode:'text',prompt:'원문',durationSeconds:7,resolution:'720p',upscale:'fast'}),state:'completed' as const,originalOutput:original};
 const child=createEnhancementInput(parent,'1080p');assert.equal(child.sourceJobId,parent.id);assert.equal(child.upscale,'ai');assert.equal(child.prompt,'원문');assert.equal(child.durationSeconds,7);assert.deepEqual(originalVideoRef(parent),original);
 assert.equal(recordVideoUpscale({...parent,input:{...parent.input,upscale:undefined}}),'ai');assert.equal(recordVideoUpscale({...parent,input:{...parent.input,upscale:undefined,resolution:'480p'}}),'fast');
 assert.throws(()=>createEnhancementInput({...parent,input:{...parent.input,durationSeconds:10}},'720p'),/7/);assert.throws(()=>createEnhancementInput({...parent,state:'running'},'720p'));assert.throws(()=>createEnhancementInput({...parent,originalOutput:undefined},'720p'));
});
