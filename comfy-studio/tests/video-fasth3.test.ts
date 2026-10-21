import test from 'node:test';import assert from 'node:assert/strict';
import {validateVideoInput} from '../lib/video/validation.ts';import {createEnhancementInput} from '../lib/video/upscale.ts';import {createPendingVideo,videoCanSubmit} from '../lib/video/submission.ts';import {withVideoRealism,FASTH3_LOOK} from '../lib/realism.ts';
import type {VideoAvailability} from '../lib/video/types.ts';
const input={mode:'text' as const,prompt:'A mug',resolution:'720p' as const,durationSeconds:10,model:'fasth3' as const};
test('FastH3 is an opt-in model limited to fast upscaling; absent model stays H3',()=>{
 assert.equal(validateVideoInput(input).model,'fasth3');assert.equal(validateVideoInput({...input,model:'h3'}).model,undefined);
 assert.throws(()=>validateVideoInput({...input,durationSeconds:7,upscale:'ai'}),/FastH3/);assert.throws(()=>validateVideoInput({...input,model:'other'}));
});
test('later AI refinement of a FastH3 video runs on H3',()=>{
 const original={filename:'a.mp4',subfolder:'ComfyStudio/video',type:'output' as const};
 const parent={...createPendingVideo({...input,durationSeconds:7,upscale:'fast'}),state:'completed' as const,originalOutput:original,sourceOutput:original};
 const child=createEnhancementInput(parent,'720p');assert.equal(child.model,undefined);assert.equal(child.upscale,'ai');
});
test('submission needs availability for the chosen model, and FastH3 adds the muted look cue',()=>{
 const preset={id:'720p',available:true,maxSeconds:10};const h3={connected:true,upscale:'fast',model:'h3',modes:[{id:'text',available:true,presets:[preset]}]} as unknown as VideoAvailability;
 assert.equal(videoCanSubmit(input,h3,false),false);assert.equal(videoCanSubmit(input,{...h3,model:'fasth3'},false),true);
 assert.ok(withVideoRealism('A woman waits','fasth3').endsWith(FASTH3_LOOK));assert.ok(!withVideoRealism('A woman waits').includes(FASTH3_LOOK));
});
