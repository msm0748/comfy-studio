import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReferenceService } from '../lib/reference-images.ts';
import { readLimitedBody } from '../lib/request-body.ts';

const root=path.resolve('.data/test-tmp');await fs.mkdir(root,{recursive:true});
test('reference storage decodes, rotates, resizes and strips metadata then survives restart',async()=>{
  const directory=await fs.mkdtemp(path.join(root,'refs-'));
  try{
    const refs=createReferenceService(directory);
    const bytes=await sharp({create:{width:2000,height:1000,channels:3,background:'#abcdef'}}).jpeg().withMetadata({orientation:6}).toBuffer();
    const record=await refs.create(bytes);
    assert.equal(record.width,768);assert.equal(record.height,1536);
    assert.deepEqual(await createReferenceService(directory).get(record.id),record);
    const meta=await sharp(await refs.image(record.id)).metadata();assert.equal(meta.format,'png');assert.equal(meta.exif,undefined);
    for(const format of ['png','webp'] as const){const input=await sharp({create:{width:20,height:10,channels:3,background:'white'}})[format]().toBuffer();const r=await refs.create(input);assert.equal(r.width,20);assert.equal(r.height,10);}
    await assert.rejects(()=>refs.get('../secrets'));
    await assert.rejects(()=>refs.get('11111111-1111-4111-8111-111111111111'),{status:404});
  }finally{assert.ok(directory.startsWith(root+path.sep));await fs.rm(directory,{recursive:true,force:true});}
});
test('reference storage rejects oversize, excessive pixels, animated, unsupported and corrupt images',async()=>{
  const directory=await fs.mkdtemp(path.join(root,'bad-refs-'));const refs=createReferenceService(directory);
  try{
    await assert.rejects(()=>refs.create(new Uint8Array(10*1024*1024+1)),{status:413});
    const large=await sharp({create:{width:5001,height:5000,channels:3,background:'white'}}).png().toBuffer();
    await assert.rejects(()=>refs.create(large),{status:413});
    await assert.rejects(()=>refs.create(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>')),{status:400});
    await assert.rejects(()=>refs.create(Buffer.from('broken')),{status:400});
    const gif=await sharp({create:{width:2,height:2,channels:3,background:'white'}}).gif().toBuffer();
    await assert.rejects(()=>refs.create(gif),{status:400});
    const png=await sharp({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer();
    await assert.rejects(()=>refs.create(png.subarray(0,40)),{status:400});
    assert.equal((await fs.readdir(directory)).length,0);
  }finally{assert.ok(directory.startsWith(root+path.sep));await fs.rm(directory,{recursive:true,force:true});}
});
test('request bodies are bounded even without or with dishonest Content-Length',async()=>{
  const request=(length?:string)=>new Request('http://localhost/api/references',{method:'POST',headers:length?{'content-length':length}:{},body:new ReadableStream({start(c){c.enqueue(new Uint8Array(6));c.enqueue(new Uint8Array(6));c.close();}}),duplex:'half'} as RequestInit);
  await assert.rejects(()=>readLimitedBody(request(),10),{status:413});
  await assert.rejects(()=>readLimitedBody(request('1'),10),{status:413});
  await assert.rejects(()=>readLimitedBody(request('20'),10),{status:413});
  assert.equal((await readLimitedBody(request(),12)).length,12);
});
