import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getModelOptions } from '../lib/comfy-client.ts';

test('cached model schemas never conceal a newly disconnected ComfyUI server',async t=>{
  const schema=JSON.parse((await readFile(new URL('./fixtures/node-info.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
  const prior=process.env.COMFYUI_WORKFLOW_DIR;
  process.env.COMFYUI_WORKFLOW_DIR=fileURLToPath(new URL('./fixtures',import.meta.url));
  let offline=false;
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{
    if(offline)throw new TypeError('connection refused');
    if(String(input).endsWith('/system_stats'))return Response.json({system:{comfyui_version:'test'}});
    if(String(input).endsWith('/object_info'))return Response.json(schema);
    throw new Error('unexpected route: '+String(input));
  });
  try {
    assert.equal((await getModelOptions()).connected,true);
    offline=true;
    const disconnected=await getModelOptions();
    assert.equal(disconnected.connected,false);
    assert.ok(disconnected.models.every(model=>!model.available));
  }finally{if(prior===undefined)delete process.env.COMFYUI_WORKFLOW_DIR;else process.env.COMFYUI_WORKFLOW_DIR=prior;}
});
