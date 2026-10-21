import test from 'node:test';
import assert from 'node:assert/strict';
import {videoFrames,getVideoPreset,videoMaxSeconds} from '../lib/video/presets.ts';
import {validateVideoInput,videoInputIssue} from '../lib/video/validation.ts';
const input={mode:'text',prompt:' A red mug ',resolution:'480p',durationSeconds:7};
test('video duration is snapped to H3 frames; fast upscale keeps 10s and AI refine caps at 7s',()=>{
 assert.deepEqual([5,6,7,8,9,10].map(videoFrames),[124,158,175,192,226,243]);
 assert.equal(getVideoPreset('1080p').maxSeconds,10);
 assert.deepEqual([videoMaxSeconds('720p','fast'),videoMaxSeconds('1080p','ai'),videoMaxSeconds('480p')],[10,7,10]);
 assert.equal(getVideoPreset('480p').maxSeconds,10);
 assert.equal(validateVideoInput(input).prompt,'A red mug');
 for(const resolution of ['720p','1080p']){assert.equal(validateVideoInput({...input,resolution,durationSeconds:10}).durationSeconds,10);assert.throws(()=>validateVideoInput({...input,resolution,durationSeconds:8,upscale:'ai'}),/7초/);assert.throws(()=>validateVideoInput({...input,resolution,durationSeconds:11}));}
 assert.match(videoInputIssue({...input,mode:'text',resolution:'720p',durationSeconds:10,upscale:'ai'})??'',/7/);
});
test('video inputs reject invalid fields, missing references, invalid duration and oversized prompts',()=>{
 for(const patch of [{mode:'bad'},{resolution:'4k'},{durationSeconds:4},{durationSeconds:11},{durationSeconds:5.5},{durationSeconds:NaN},{durationSeconds:'7'},{prompt:''},{prompt:42},{prompt:'x'.repeat(8001)},{mode:'image'},{referenceId:'11111111-1111-4111-8111-111111111111'},{frames:3600},{filename:'../x'}])assert.throws(()=>validateVideoInput({...input,...patch}));
 const image=validateVideoInput({...input,mode:'image',referenceId:'11111111-1111-4111-8111-111111111111'});
 assert.equal(image.mode,'image');
 for(const value of [null,[],false,{}])assert.throws(()=>validateVideoInput(value));
});

test('upscale choice is independent of resolution and source enhancement is validated',()=>{
 assert.equal(validateVideoInput({...input,resolution:'720p',upscale:'fast'}).upscale,'fast');assert.equal(validateVideoInput({...input,resolution:'1080p',upscale:'ai'}).upscale,'ai');
 for(const patch of [{upscale:'bad'},{upscale:'ai',resolution:'480p'},{sourceJobId:'bad',upscale:'ai',resolution:'720p'},{sourceJobId:'11111111-1111-4111-8111-111111111111',upscale:'fast',resolution:'720p'}])assert.throws(()=>validateVideoInput({...input,...patch}));
});
