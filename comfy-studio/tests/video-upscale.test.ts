import test from 'node:test';import assert from 'node:assert/strict';
import {originalVideoRef,recordVideoUpscale} from '../lib/video/upscale.ts';import {createPendingVideo} from '../lib/video/submission.ts';
const original={filename:'original.mp4',subfolder:'ComfyStudio/video',type:'output' as const};
test('older job records keep their meaning',()=>{
 const job={...createPendingVideo({mode:'text',prompt:'원문',durationSeconds:7,resolution:'720p',upscale:'fast'}),state:'completed' as const,originalOutput:original};
 assert.deepEqual(originalVideoRef(job),original);
 assert.equal(recordVideoUpscale(job),'fast');assert.equal(recordVideoUpscale({...job,input:{...job.input,upscale:undefined}}),'ai');assert.equal(recordVideoUpscale({...job,input:{...job.input,upscale:undefined,resolution:'480p'}}),'fast');
});
