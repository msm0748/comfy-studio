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
