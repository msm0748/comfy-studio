import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { createJobService, normalizeHistory, validateGraphModels, PreparationError } from '../lib/jobs.ts';
import type { GenerationInput, NodeInfo } from '../lib/types.ts';
const input:GenerationInput={modelId:'z-image',prompt:'a red chair',sizeId:'square'};
test('edit reference and identity survive restart and cannot be changed under the same job ID',async()=>{
  const directory=await mkdtemp(path.join(tempRoot,'edit-jobs-'));
  const edit:GenerationInput={modelId:'qwen-edit-2511',prompt:'at the beach',sizeId:'square',referenceId:randomUUID(),preserveIdentity:true};
  let submissions=0;
  const deps={directory,submit:async()=>{submissions++;return 'edit-prompt';},inspect:async()=>({state:'running' as const,images:[]}),image:async()=>new Response('image')};
  try{
    const id=randomUUID();const service=createJobService(deps);
    await Promise.all([service.submitGeneration(edit,id),service.submitGeneration(edit,id)]);
    const restarted=createJobService(deps);assert.deepEqual((await restarted.getGeneration(id)).input,edit);
    await assert.rejects(()=>restarted.submitGeneration({...edit,referenceId:randomUUID()},id));
    assert.equal(submissions,1);
  }finally{await cleanup(directory);}
});
const tempRoot=path.resolve('.data','test-tmp');
await mkdir(tempRoot,{recursive:true});
async function cleanup(directory:string){
  assert.ok(path.resolve(directory).startsWith(tempRoot+path.sep));
  await rm(directory,{recursive:true,force:true});
}
test('a failure before prompt submission fails immediately and permits a fresh safe retry',async()=>{
  const directory=await mkdtemp(path.join(tempRoot,'prepare-'));let attempts=0;let recoveries=0;
  const deps={directory,submit:async()=>{attempts++;if(attempts===1)throw new PreparationError('Reference upload unavailable');return 'accepted';},inspect:async()=>({state:'running' as const,images:[]}),image:async()=>new Response('image'),recover:async()=>{recoveries++;return null;}};
  try{const service=createJobService(deps);const first=await service.submitGeneration(input,randomUUID());assert.equal(first.state,'failed');assert.equal((await service.getGeneration(first.id)).state,'failed');assert.equal(recoveries,0);assert.equal((await service.submitGeneration(input,randomUUID())).state,'queued');}
  finally{await cleanup(directory);}
});
test('persists a submitted job and repeated requests never queue it twice', async () => {
  const directory=await mkdtemp(path.join(tempRoot,'comfy-jobs-'));
  let submissions=0;
  const deps={directory,submit:async()=>{submissions++; return 'prompt-1';},inspect:async()=>({state:'completed' as const,images:[{filename:'result.png',subfolder:'ComfyStudio',type:'output' as const}]}),image:async()=>new Response('image')};
  try {
    const service=createJobService(deps); const id=randomUUID();
    await Promise.all([service.submitGeneration(input,id),service.submitGeneration(input,id)]);
    assert.equal(submissions,1);
    const restarted=createJobService(deps);
    assert.equal((await restarted.getGeneration(id)).state,'completed');
    assert.equal(await (await restarted.getGenerationImage(id,0)).text(),'image');
    assert.equal(submissions,1);
    await assert.rejects(()=>restarted.submitGeneration({...input,prompt:'different'},id));
    await assert.rejects(()=>restarted.getGenerationImage(id,1));
    await assert.rejects(()=>restarted.getGeneration('../secrets'));
  } finally {await cleanup(directory);}
});
test('network failure during polling leaves the persisted queued job recoverable', async () => {
  const directory=await mkdtemp(path.join(tempRoot,'comfy-jobs-'));
  let offline=true;
  try {
    const service=createJobService({directory,submit:async()=> 'p',inspect:async()=>{if(offline)throw new Error('offline');return {state:'running',images:[]};},image:async()=>new Response()});
    const job=await service.submitGeneration(input,randomUUID());
    await assert.rejects(()=>service.getGeneration(job.id));
    offline=false; assert.equal((await service.getGeneration(job.id)).state,'running');
  } finally {await cleanup(directory);}
});
test('history errors and dangerous image paths are rejected rather than exposed', () => {
  const bad={outputs:{'9':{images:[{filename:'../private.txt',subfolder:'',type:'output'}]}},status:{status_str:'success',completed:true,messages:[]}};
  assert.throws(()=>normalizeHistory(bad));
  const failed=normalizeHistory({outputs:{},status:{status_str:'error',completed:false,messages:[['execution_error',{exception_message:'out of memory'}]]}});
  assert.equal(failed.state,'failed'); assert.ok(failed.error);
});
test('missing installed models disable a graph even when the loader node exists', () => {
  const info:NodeInfo={UNETLoader:{input:{required:{unet_name:[['installed.safetensors']]}}}};
  assert.throws(()=>validateGraphModels({'1':{class_type:'UNETLoader',inputs:{unet_name:'missing.safetensors'}}},info));
});
test('a metadata replace failure after acceptance preserves a recoverable queued job',async t=>{
  const directory=await mkdtemp(path.join(tempRoot,'comfy-jobs-'));
  const rename=fs.rename;let fail=true;let submits=0;
  t.mock.method(fs,'rename',async(...args:Parameters<typeof rename>)=>{if(fail){fail=false;throw Object.assign(new Error('file temporarily locked'),{code:'EPERM'});}return rename(...args);});
  syncBuiltinESMExports();
  try {
    const deps={directory,submit:async()=>{submits++;return 'accepted-prompt';},inspect:async()=>({state:'completed' as const,images:[{filename:'result.png',subfolder:'',type:'output' as const}]}),image:async()=>new Response('image')};
    const service=createJobService(deps);const id=randomUUID();
    const job=await service.submitGeneration(input,id);
    assert.equal(job.state,'queued');assert.equal(job.promptId,'accepted-prompt');
    assert.equal((await createJobService(deps).getGeneration(id)).state,'completed');
    assert.equal(submits,1);
  } finally {t.mock.restoreAll();syncBuiltinESMExports();await cleanup(directory);}
});
