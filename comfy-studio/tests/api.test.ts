import test from 'node:test';
import assert from 'node:assert/strict';
import { sameOrigin } from '../lib/api.ts';
test('accepts the actual request Host when Next.js normalizes its internal request URL',()=>{
  assert.doesNotThrow(()=>sameOrigin(new Request('http://localhost:3001/api/generations',{headers:{Host:'127.0.0.1:3001',Origin:'http://127.0.0.1:3001'}})));
});
test('rejects cross-site origins even when they target the local API',()=>{
  assert.throws(()=>sameOrigin(new Request('http://localhost:3001/api/generations',{headers:{Host:'127.0.0.1:3001',Origin:'https://evil.example'}})));
});
