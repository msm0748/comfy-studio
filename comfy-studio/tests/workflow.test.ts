import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileWorkflow } from '../lib/workflow.ts';
import { getPreset } from '../lib/presets.ts';
import type { NodeInfo, ApiGraph, Preset } from '../lib/types.ts';

// Snapshots from the three installed graphs and relevant object_info schemas.
const json = async (name:string) => JSON.parse((await readFile(new URL('./fixtures/'+name, import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const loadWorkflow = (preset:Preset) => json(preset.workflowFile);
const nodeInfo = await json('node-info.json') as NodeInfo;
function ofType(g: ApiGraph, type: string) { return Object.values(g).filter(n => n.class_type === type); }
test('Z-Image uses top-level settings and only replaces prompt and dimensions', async () => {
  const preset = getPreset('z-image');
  const workflow = await loadWorkflow(preset);
  const before = JSON.stringify(workflow);
  const g = compileWorkflow(preset, workflow, {modelId:'z-image',prompt:'한글 🌙',sizeId:'portrait'}, nodeInfo);
  const sampler = ofType(g,'KSampler')[0].inputs;
  assert.equal(sampler.steps,8); assert.equal(sampler.cfg,1);
  assert.equal(sampler.sampler_name,'res_multistep'); assert.equal(sampler.scheduler,'simple');
  assert.deepEqual(ofType(g,'EmptySD3LatentImage')[0].inputs,{width:896,height:1152,batch_size:1});
  assert.equal(ofType(g,'CLIPTextEncode')[0].inputs.text,'한글 🌙');
  assert.equal(ofType(g,'CLIPLoader')[0].inputs.clip_name,'qwen_3_4b.safetensors');
  assert.equal(JSON.stringify(workflow), before);
  assert.ok(Number.isSafeInteger(sampler.seed));
});
test('Qwen resolves saved switch branches and enables Lightning only when switched on', async () => {
  const preset=getPreset('qwen-2512');
  const workflow=await loadWorkflow(preset) as {nodes:{type:string;widgets_values:unknown[]}[]};
  const g=compileWorkflow(preset,workflow,{modelId:preset.id,prompt:'test',sizeId:'square'},nodeInfo);
  assert.equal(ofType(g,'KSampler')[0].inputs.steps,50);
  assert.equal(ofType(g,'KSampler')[0].inputs.cfg,4);
  assert.equal(ofType(g,'LoraLoaderModelOnly').length,0);
  const invocation=workflow.nodes.find(n=>n.type==='c3c58f7e-2004-43ae-8b06-a956294bf7f4')!;
  invocation.widgets_values=[true];
  const turbo=compileWorkflow(preset,workflow,{modelId:preset.id,prompt:'test',sizeId:'square'},nodeInfo);
  assert.equal(ofType(turbo,'KSampler')[0].inputs.steps,4);
  assert.equal(ofType(turbo,'KSampler')[0].inputs.cfg,1);
  assert.equal(ofType(turbo,'LoraLoaderModelOnly').length,1);
});
test('Krea preserves prompt expansion, sampling options and bypassed style LoRA', async () => {
  const preset=getPreset('krea-2');
  const g=compileWorkflow(preset,await loadWorkflow(preset),{modelId:preset.id,prompt:'A red chair',sizeId:'wide'},nodeInfo);
  assert.equal(ofType(g,'KSampler')[0].inputs.steps,8);
  assert.equal(ofType(g,'LoraLoaderModelOnly').length,0);
  const textgen=ofType(g,'TextGenerate')[0];
  assert.ok(textgen); assert.equal(textgen.inputs.thinking,false);
  assert.equal(textgen.inputs['sampling_mode.temperature'],0.7);
  assert.equal(ofType(g,'EmptyLatentImage')[0].inputs.width,1344);
  assert.ok(ofType(g,'PrimitiveStringMultiline').some(n=>n.inputs.value==='A red chair'));
});
test('rejects unsupported graphs and missing required execution nodes', async () => {
  const preset=getPreset('z-image');
  assert.throws(()=>compileWorkflow(preset,{}, {modelId:preset.id,prompt:'x',sizeId:'square'},nodeInfo));
  const info=structuredClone(nodeInfo); delete info.KSampler;
  assert.throws(()=>compileWorkflow(preset,awaitedWorkflow,{modelId:preset.id,prompt:'x',sizeId:'square'},info));
});
const awaitedWorkflow=await loadWorkflow(getPreset('z-image'));
