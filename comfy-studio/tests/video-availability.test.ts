import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,copyFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {getVideoAvailability} from '../lib/video/service.ts';
test('AI720 availability checks the encoder before expensive enhancement can be accepted',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'video-availability-'));const prior={workflow:process.env.COMFYUI_WORKFLOW_DIR,encoder:process.env.STUDIO_FFMPEG_PATH,validation:process.env.STUDIO_VIDEO_VALIDATION_MODE};
 try{
  await copyFile(new URL('./fixtures/video/text.json',import.meta.url),path.join(directory,'MiniMax-H3-T2V-7s-Single-Shot.json'));await copyFile(new URL('./fixtures/video/image.json',import.meta.url),path.join(directory,'MiniMax-H3-I2V-7s-RTX3090.json'));
  process.env.COMFYUI_WORKFLOW_DIR=directory;process.env.STUDIO_FFMPEG_PATH=path.join(directory,'missing-encoder.exe');process.env.STUDIO_VIDEO_VALIDATION_MODE='1';const schema=JSON.parse(await readFile(new URL('./fixtures/video/node-info.json',import.meta.url),'utf8'));
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{if(String(input).endsWith('/system_stats'))return Response.json({});if(String(input).endsWith('/object_info'))return Response.json(schema);throw Error('Unexpected fetch');});
  const ai=await getVideoAvailability('ai');assert.equal(ai.upscale,'ai');for(const mode of ai.modes){const preset=mode.presets.find(p=>p.id==='720p')!;assert.equal(preset.available,false);assert.match(preset.reason??'',/missing-encoder/);}
  const fast=await getVideoAvailability('fast');assert.ok(fast.modes.every(m=>m.presets.find(p=>p.id==='480p')?.available));assert.ok(fast.modes.every(m=>!m.presets.find(p=>p.id==='720p')?.available));
 }finally{for(const [key,value] of Object.entries({COMFYUI_WORKFLOW_DIR:prior.workflow,STUDIO_FFMPEG_PATH:prior.encoder,STUDIO_VIDEO_VALIDATION_MODE:prior.validation})){if(value===undefined)delete process.env[key];else process.env[key]=value;}await rm(directory,{recursive:true,force:true});}
});
