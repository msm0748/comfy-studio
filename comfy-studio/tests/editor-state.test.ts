import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreEditorState } from '../lib/editor-state.ts';
import type { GenerationInput } from '../lib/types.ts';
test('reconnecting retries reference hydration and restores the saved edit instruction and identity setting',async()=>{
  const input:GenerationInput={modelId:'qwen-edit-2511',sizeId:'portrait',prompt:'new background',referenceId:'11111111-1111-4111-8111-111111111111',preserveIdentity:false};
  const reference={id:input.referenceId!,width:100,height:200,createdAt:new Date().toISOString()};
  const failed=await restoreEditorState(input,async()=>{throw Error('offline');});assert.equal(failed.reference,null);assert.ok(failed.referenceError);assert.deepEqual(failed.input,input);
  const retried=await restoreEditorState(input,async id=>{assert.equal(id,input.referenceId);return reference;});assert.deepEqual(retried.reference,reference);assert.equal(retried.referenceError,'');assert.equal(retried.input.preserveIdentity,false);
});
