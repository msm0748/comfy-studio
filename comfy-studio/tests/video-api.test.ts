import test from 'node:test';import assert from 'node:assert/strict';import {handleVideoPost,handleVideoEnhancePost} from '../lib/video/api.ts';import {ServiceError} from '../lib/jobs.ts';
const input={mode:'text',prompt:'A mug',resolution:'480p',durationSeconds:7};
test('video POST authenticates before work and blocks cross-site, oversized or forged settings',async()=>{
 let submitted=0;const deps={authorize:async()=>{},submit:async()=>{submitted++;return {id:'ok'};}};
 const request=(body:unknown,origin='http://localhost')=>new Request('http://localhost/api/videos',{method:'POST',headers:{origin,'content-type':'application/json','Idempotency-Key':'11111111-1111-4111-8111-111111111111'},body:JSON.stringify(body)});
 await assert.rejects(()=>handleVideoPost(request(input),{...deps,authorize:async()=>{throw new ServiceError('login',401);}}),{status:401});
 await assert.rejects(()=>handleVideoPost(request(input,'https://evil.example'),deps),{status:403});
 await assert.rejects(()=>handleVideoPost(request({...input,prompt:'x'.repeat(41000)}),deps),{status:413});
 await assert.rejects(()=>handleVideoPost(request({...input,resolution:'1080p',durationSeconds:10,upscale:'ai'}),deps),{status:400});
 assert.equal(submitted,0);assert.deepEqual(await handleVideoPost(request(input),deps),{id:'ok'});assert.equal(submitted,1);
});

test('enhancement endpoint validates auth, origin, identity and only a high-resolution output field',async()=>{
 const source='22222222-2222-4222-8222-222222222222',id='11111111-1111-4111-8111-111111111111';let sent=0;
 const deps={authorize:async()=>{},submit:async(parent:string,resolution:string,key:string)=>{sent++;assert.deepEqual([parent,resolution,key],[source,'1080p',id]);return {id:key};}};
 const request=(body:unknown,origin='http://localhost')=>new Request('http://localhost/api/videos/'+source+'/enhance',{method:'POST',headers:{origin,'Idempotency-Key':id},body:JSON.stringify(body)});
 await assert.rejects(()=>handleVideoEnhancePost(request({resolution:'1080p'}),source,{...deps,authorize:async()=>{throw new ServiceError('login',401);}}),{status:401});
 await assert.rejects(()=>handleVideoEnhancePost(request({resolution:'1080p'},'https://evil.example'),source,deps),{status:403});
 for(const value of [{resolution:'480p'},{resolution:'1080p',prompt:'replace'},{resolution:'1080p',durationSeconds:5}])await assert.rejects(()=>handleVideoEnhancePost(request(value),source,deps),{status:400});
 assert.equal(sent,0);assert.deepEqual(await handleVideoEnhancePost(request({resolution:'1080p'}),source,deps),{id});assert.equal(sent,1);
});
