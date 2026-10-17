import test from 'node:test';import assert from 'node:assert/strict';import {handleVideoPost} from '../lib/video/api.ts';import {ServiceError} from '../lib/jobs.ts';
const input={mode:'text',prompt:'A mug',resolution:'480p',durationSeconds:7};
test('video POST authenticates before work and blocks cross-site, oversized or forged settings',async()=>{
 let submitted=0;const deps={authorize:async()=>{},submit:async()=>{submitted++;return {id:'ok'};}};
 const request=(body:unknown,origin='http://localhost')=>new Request('http://localhost/api/videos',{method:'POST',headers:{origin,'content-type':'application/json','Idempotency-Key':'11111111-1111-4111-8111-111111111111'},body:JSON.stringify(body)});
 await assert.rejects(()=>handleVideoPost(request(input),{...deps,authorize:async()=>{throw new ServiceError('login',401);}}),{status:401});
 await assert.rejects(()=>handleVideoPost(request(input,'https://evil.example'),deps),{status:403});
 await assert.rejects(()=>handleVideoPost(request({...input,prompt:'x'.repeat(41000)}),deps),{status:413});
 await assert.rejects(()=>handleVideoPost(request({...input,resolution:'1080p',durationSeconds:10}),deps),{status:400});
 assert.equal(submitted,0);assert.deepEqual(await handleVideoPost(request(input),deps),{id:'ok'});assert.equal(submitted,1);
});
