import test from 'node:test';
import assert from 'node:assert/strict';
import {videoFrames,getVideoPreset,VIDEO_PRESETS} from '../lib/video/presets.ts';
import {validateVideoInput,videoInputIssue} from '../lib/video/validation.ts';
const input={mode:'text',prompt:' A red mug ',resolution:'720p',durationSeconds:7};
test('video duration is snapped to the frame grid and outputs are 720p or 1080p up to 10s',()=>{
 assert.deepEqual([5,6,7,8,9,10].map(videoFrames),[124,158,175,192,226,243]);
 assert.deepEqual(VIDEO_PRESETS.map(p=>[p.id,p.maxSeconds]),[['720p',10],['1080p',10]]);assert.equal(getVideoPreset('1080p').width,1920);
 assert.equal(validateVideoInput(input).prompt,'A red mug');
 for(const resolution of ['720p','1080p']){assert.equal(validateVideoInput({...input,resolution,durationSeconds:10}).durationSeconds,10);assert.throws(()=>validateVideoInput({...input,resolution,durationSeconds:11}));}
});
test('video inputs reject invalid fields, missing references, invalid duration and oversized prompts',()=>{
 for(const patch of [{mode:'bad'},{resolution:'4k'},{durationSeconds:4},{durationSeconds:11},{durationSeconds:5.5},{durationSeconds:NaN},{durationSeconds:'7'},{prompt:''},{prompt:42},{prompt:'x'.repeat(8001)},{mode:'image'},{referenceId:'11111111-1111-4111-8111-111111111111'},{frames:3600},{filename:'../x'}])assert.throws(()=>validateVideoInput({...input,...patch}));
 const image=validateVideoInput({...input,mode:'image',referenceId:'11111111-1111-4111-8111-111111111111'});
 assert.equal(image.mode,'image');
 for(const value of [null,[],false,{}])assert.throws(()=>validateVideoInput(value));
});
test('every new video uses Singularity; removed models, 480p and AI refinement are refused',()=>{
 assert.equal(validateVideoInput(input).model,'singularity');assert.equal(validateVideoInput({...input,model:'singularity',upscale:'fast'}).upscale,'fast');
 for(const patch of [{model:'h3'},{model:'fasth3'},{model:'other'},{resolution:'480p'},{upscale:'ai'},{upscale:'bad'},{sourceJobId:'11111111-1111-4111-8111-111111111111'}])assert.ok(videoInputIssue({...input,...patch} as never),JSON.stringify(patch));
});
