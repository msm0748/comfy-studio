import test from 'node:test';
import assert from 'node:assert/strict';
import { createPendingJob, submitOrRecover, restorePendingJob, canGenerate, disableModels } from '../lib/submission.ts';
import { getPreset } from '../lib/presets.ts';
import type { GenerationInput,JobRecord } from '../lib/types.ts';
const input:GenerationInput={modelId:'z-image',sizeId:'square',prompt:'test'};
test('a lost POST response recovers the same accepted job without another submission',async()=>{
  const pending=createPendingJob(input);let sends=0;
  const accepted:JobRecord={...pending,promptId:'p1',state:'queued'};
  const result=await submitOrRecover(pending,async()=>{sends++;throw new Error('response lost');},async id=>{assert.equal(id,pending.id);return accepted;});
  assert.equal(result.id,pending.id);assert.equal(result.state,'queued');assert.equal(sends,1);
});
test('POST and restoration network failures keep the persisted identity active',async()=>{
  const pending=createPendingJob(input);
  const offline=async()=>{throw new Error('offline');};
  const result=await submitOrRecover(pending,offline,offline);
  assert.equal(result.id,pending.id);assert.equal(result.state,'submitting');
  const restored=await restorePendingJob(result,offline);
  assert.equal(restored.id,pending.id);assert.equal(restored.state,'submitting');
  assert.equal(canGenerate(true,{...getPreset('z-image'),available:true},true,input.prompt),false);
});
test('offline state and failed availability refresh block generation while retaining model labels',()=>{
  const models=[{...getPreset('z-image'),available:true}];
  assert.equal(canGenerate(false,models[0],false,'test'),false);
  assert.equal(canGenerate(null,models[0],false,'test'),false);
  const offline=disableModels(models);
  assert.equal(offline[0].available,false);assert.equal(offline[0].name,'Z-Image Turbo');
  assert.equal(canGenerate(true,offline[0],false,'test'),false);
});
