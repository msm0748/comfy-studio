import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import os from 'node:os';
import {getVideoAvailability} from '../lib/video/service.ts';import {videoSchema} from './video-schema.ts';
const prior={encoder:process.env.STUDIO_FFMPEG_PATH,validation:process.env.STUDIO_VIDEO_VALIDATION_MODE};
const restore=()=>{for(const [key,value] of Object.entries({STUDIO_FFMPEG_PATH:prior.encoder,STUDIO_VIDEO_VALIDATION_MODE:prior.validation})){if(value===undefined)delete process.env[key];else process.env[key]=value;}};
test('1080p needs the encoder while 720p does not, and a missing model blocks both',async t=>{
 try{
  process.env.STUDIO_FFMPEG_PATH=path.join(os.tmpdir(),'missing-encoder.exe');process.env.STUDIO_VIDEO_VALIDATION_MODE='1';let schema=await videoSchema();
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{if(String(input).endsWith('/system_stats'))return Response.json({});if(String(input).endsWith('/object_info'))return Response.json(schema);throw Error('Unexpected fetch');});
  const available=await getVideoAvailability();
  for(const mode of available.modes){assert.ok(mode.presets.find(p=>p.id==='720p')!.available);const full=mode.presets.find(p=>p.id==='1080p')!;assert.equal(full.available,false);assert.match(full.reason??'',/missing-encoder/);}
  schema=await videoSchema();schema.UNETLoader.input.required!.unet_name[0]=[];
  const missing=await getVideoAvailability();assert.ok(missing.modes.every(m=>!m.available&&/모델 파일/.test(m.presets[0].reason??'')));
 }finally{restore();}
});
