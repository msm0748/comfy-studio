import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,mkdir} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {createVideoJobService,normalizeVideoHistory,safeVideoOutput} from '../lib/video/jobs.ts';import {PreparationError} from '../lib/jobs.ts';
const input={mode:'text' as const,prompt:'빨간 머그컵',resolution:'480p' as const,durationSeconds:7};
const output={filename:'clip.mp4',subfolder:'ComfyStudio/video',type:'output' as const};
await mkdir('.data/test-tmp',{recursive:true});
test('video jobs preserve original settings across restart and never submit the same identity twice',async()=>{
 const directory=await mkdtemp(path.resolve('.data/test-tmp/video-'));let sent=0;
 const deps={directory,submit:async()=>{sent++;return 'prompt';},inspect:async()=>({state:'completed' as const,output}),recover:async()=>null,finalize:async()=>({kind:'comfy' as const,ref:output})};
 try{const service=createVideoJobService(deps),id=randomUUID();const [a,b]=await Promise.all([service.submit(input,id),service.submit(input,id)]);assert.equal(a.promptId,b.promptId);assert.equal(sent,1);
  await assert.rejects(()=>service.submit({...input,durationSeconds:6},id),{status:409});
  const restored=createVideoJobService(deps);let job=await restored.get(id);assert.deepEqual(job.input,input);
  for(let n=0;n<10&&job.state!=='completed';n++){await new Promise(r=>setTimeout(r,5));job=await restored.get(id);}assert.equal(job.state,'completed');assert.equal(sent,1);assert.equal(job.frames,175);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('preparation failure is terminal while ambiguous submission recovers the original prompt',async()=>{
 const directory=await mkdtemp(path.resolve('.data/test-tmp/video-'));let recover=false;
 const deps={directory,submit:async()=>{throw recover?new Error('lost'):new PreparationError('번역 실패');},inspect:async()=>({state:'running' as const}),recover:async()=> 'accepted',finalize:async()=>({kind:'comfy' as const,ref:output})};
 try{const service=createVideoJobService(deps);assert.equal((await service.submit(input,randomUUID())).state,'failed');recover=true;const pending=await service.submit(input,randomUUID());assert.equal(pending.state,'submitting');assert.equal((await service.get(pending.id)).promptId,'accepted');}finally{await rm(directory,{recursive:true,force:true});}
});
test('video history rejects unsafe output and completed jobs without video',()=>{
 assert.equal(normalizeVideoHistory({status:{completed:true},outputs:{'1':{images:[output]}}}).state,'completed');
 assert.equal(normalizeVideoHistory({status:{completed:true},outputs:{}}).state,'failed');
 assert.throws(()=>normalizeVideoHistory({status:{completed:true},outputs:{'1':{images:[{...output,filename:'../x.mp4'}]}}}));
});
test('native Windows output folders normalize safely without accepting traversal or absolute paths',()=>{
 assert.equal(safeVideoOutput({...output,subfolder:'ComfyStudio\\video'}).subfolder,'ComfyStudio/video');
 for(const subfolder of ['..\\secret','C:\\secret','\\\\server\\share','video\\..\\secret','video/./x'])assert.throws(()=>safeVideoOutput({...output,subfolder}));
});

test('explicit finalization retry uses persisted source across restart without another generation',async()=>{
 const directory=await mkdtemp(path.resolve('.data/test-tmp/video-'));let sent=0,broken=true;
 const deps={directory,submit:async()=>{sent++;return 'original';},inspect:async()=>({state:'completed' as const,output}),recover:async()=>null,finalize:async()=>{if(broken)throw Error('temporary encoder failure');return {kind:'comfy' as const,ref:output};}};
 try{let service=createVideoJobService(deps);const id=randomUUID();await service.submit(input,id);let job=await service.get(id);
  for(let n=0;n<30&&job.state!=='failed';n++){await new Promise(r=>setTimeout(r,5));job=await service.get(id);}assert.equal(job.state,'failed');assert.deepEqual(job.sourceOutput,output);
  broken=false;service=createVideoJobService(deps);await service.retryFinalization(id);job=await service.get(id);
  for(let n=0;n<30&&job.state!=='completed';n++){await new Promise(r=>setTimeout(r,5));job=await service.get(id);}assert.equal(job.state,'completed');assert.equal(job.promptId,'original');assert.equal(sent,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
