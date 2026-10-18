import test from 'node:test';import assert from 'node:assert/strict';
import {createPendingVideo,submitOrRecoverVideo,videoCanSubmit,createVideoReferenceLoader} from '../lib/video/submission.ts';
import type {VideoAvailability} from '../lib/video/types.ts';import type {ReferenceRecord} from '../lib/types.ts';
const input={mode:'text' as const,prompt:'A mug',resolution:'480p' as const,durationSeconds:10};
test('video response loss recovers the same identity and invalid resolution change never silently trims duration',async()=>{
 const pending=createPendingVideo(input);let sent=0;
 const restored=await submitOrRecoverVideo(pending,async()=>{sent++;throw Error('response lost');},async id=>({...pending,id,promptId:'accepted',state:'queued'}));assert.equal(restored.id,pending.id);assert.equal(restored.promptId,'accepted');assert.equal(sent,1);
 const unavailable=await submitOrRecoverVideo(pending,async()=>{throw Error('lost');},async()=>{throw Error('offline');});assert.equal(unavailable.id,pending.id);assert.equal(unavailable.state,'submitting');
 const available={connected:true,modes:[{id:'text',available:true,presets:[{id:'720p',available:true,maxSeconds:7}]}]} as VideoAvailability;
 const changed={...input,resolution:'720p' as const};assert.equal(videoCanSubmit(changed,available,false),false);assert.equal(changed.durationSeconds,10);
});
test('late reference response cannot replace the most recently selected reference',async()=>{
 const waits:((r:ReferenceRecord)=>void)[]=[];const loader=createVideoReferenceLoader(()=>new Promise<ReferenceRecord>(resolve=>waits.push(resolve)));
 const first=loader.load('first'),second=loader.load('second');const reference={id:'second',width:100,height:100,createdAt:''};waits[1](reference);assert.deepEqual(await second,reference);waits[0]({...reference,id:'first'});assert.equal(await first,null);
});
