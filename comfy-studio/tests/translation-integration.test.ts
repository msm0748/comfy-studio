import test from 'node:test';import assert from 'node:assert/strict';import {readFile,rm} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';import {submitGeneration} from '../lib/comfy-client.ts';import type {ApiGraph} from '../lib/types.ts';
test('translation reaches Comfy graph once per job while original input persists; denial never queues generation',async t=>{
 const schema=JSON.parse((await readFile(new URL('./fixtures/node-info.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
 const oldKey=process.env.GOOGLE_TRANSLATE_API_KEY,oldDir=process.env.COMFYUI_WORKFLOW_DIR;
 process.env.GOOGLE_TRANSLATE_API_KEY='test-only';process.env.COMFYUI_WORKFLOW_DIR=fileURLToPath(new URL('./fixtures',import.meta.url));
 let translated=0,submitted=0,deny=false;const ids=[randomUUID(),randomUUID()];
 t.mock.method(globalThis,'fetch',async(url:RequestInfo|URL,options?:RequestInit)=>{
  if(String(url).startsWith('https://translation.googleapis.com/')){translated++;return deny?Response.json({}, {status:403}):Response.json({data:{translations:[{translatedText:'A red chair',detectedSourceLanguage:'ko'}]}});}
  if(String(url).endsWith('/object_info'))return Response.json(schema);
  if(String(url).endsWith('/prompt')){submitted++;const graph=JSON.parse(String(options?.body)).prompt as ApiGraph;assert.equal(Object.values(graph).find(n=>n.class_type==='CLIPTextEncode')?.inputs.text,'A red chair');return Response.json({prompt_id:'translated-prompt'});}
  throw Error('Unexpected URL');
 });
 try{
  const input={modelId:'z-image' as const,prompt:'빨간 의자',sizeId:'square' as const};
  const [one,two]=await Promise.all([submitGeneration(input,ids[0]),submitGeneration(input,ids[0])]);assert.equal(one.input.prompt,input.prompt);assert.deepEqual(one,two);assert.equal(translated,1);assert.equal(submitted,1);
  deny=true;const rejected=await submitGeneration(input,ids[1]);assert.equal(rejected.state,'failed');assert.equal(submitted,1);assert.match(rejected.error??'',/번역/);
 }finally{
  if(oldKey===undefined)delete process.env.GOOGLE_TRANSLATE_API_KEY;else process.env.GOOGLE_TRANSLATE_API_KEY=oldKey;
  if(oldDir===undefined)delete process.env.COMFYUI_WORKFLOW_DIR;else process.env.COMFYUI_WORKFLOW_DIR=oldDir;
  for(const id of ids)await rm(new URL('../.data/jobs/'+id+'.json',import.meta.url),{force:true});
 }
});
