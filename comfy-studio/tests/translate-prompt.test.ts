import test from 'node:test';
import assert from 'node:assert/strict';
import {createPromptTranslator} from '../lib/translate-prompt.ts';
test('missing identity, denied permission, corrupt reply and network failures stop preparation without provider details',async()=>{
 await assert.rejects(createPromptTranslator({token:async()=>{throw Error('secret-token');}})('한글'),/설정/);
 for(const fetch of [async()=>Response.json({error:{message:'secret-token prompt'}},{status:403}),async()=>Response.json({translations:[]}),async()=>{throw Error('secret-token');}]){
  await assert.rejects(createPromptTranslator({token:async()=> 'secret-token',fetch})('한글'),error=>{assert.ok(error instanceof Error);assert.doesNotMatch(error.message,/secret-token|prompt/);return true;});
 }
});
