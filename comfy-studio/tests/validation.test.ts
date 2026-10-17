import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGenerationInput } from '../lib/validation.ts';

const input = { modelId: 'z-image', sizeId: 'square', prompt: ' test ' };
test('trims outer whitespace and preserves Korean, newlines and literal HTML', () => {
  assert.deepEqual(validateGenerationInput(input), { ...input, prompt: 'test' });
  const prompt = '한글 🌙\n<script>hello</script>';
  assert.equal(validateGenerationInput({ ...input, prompt }).prompt, prompt);
});
test('rejects empty, oversized and non-string prompts', () => {
  for (const prompt of ['', '   ', 'a'.repeat(8001), 123, null]) {
    assert.throws(() => validateGenerationInput({ ...input, prompt }));
  }
  assert.equal(validateGenerationInput({ ...input, prompt: 'a'.repeat(8000) }).prompt.length, 8000);
});
test('rejects research models, unregistered sizes and client sampling controls', () => {
  for (const value of [null, [], { ...input, modelId: 'qwen-2.1' }, { ...input, sizeId: '8192' }, { ...input, steps: 1 }]) {
    assert.throws(() => validateGenerationInput(value));
  }
});

test('editing requires a UUID reference and a boolean identity preference, without changing legacy inputs',()=>{
  const edit={modelId:'qwen-edit-2511',prompt:' change the background ',sizeId:'square',referenceId:'12345678-1234-4234-8234-123456789abc'};
  assert.deepEqual(validateGenerationInput(edit),{...edit,prompt:'change the background',preserveIdentity:true});
  assert.equal(validateGenerationInput({...edit,preserveIdentity:false}).preserveIdentity,false);
  for(const referenceId of [undefined,'../secret','https://example.com/photo.png','bad']) assert.throws(()=>validateGenerationInput({...edit,referenceId}));
  for(const preserveIdentity of ['true',1,null])assert.throws(()=>validateGenerationInput({...edit,preserveIdentity}));
  assert.throws(()=>validateGenerationInput({...input,referenceId:edit.referenceId}));
  assert.throws(()=>validateGenerationInput({...input,preserveIdentity:true}));
  assert.deepEqual(validateGenerationInput(input),{...input,prompt:'test'});
});
