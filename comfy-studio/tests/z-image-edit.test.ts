import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGenerationInput } from '../lib/validation.ts';
import { compileZImageEdit } from '../lib/z-image-edit.ts';
import type { ApiGraph,NodeInfo } from '../lib/types.ts';
import { authDecision } from '../lib/auth.ts';
import { readFile } from 'node:fs/promises';
const referenceId='12345678-1234-4234-8234-123456789abc';
test('Z editing accepts only three strength presets and requires a reference',()=>{
 const input=validateGenerationInput({modelId:'z-image-edit',prompt:'cafe',sizeId:'square',referenceId,strength:'strong'});
 assert.equal(input.strength,'strong');
 assert.equal(validateGenerationInput({...input,strength:undefined}).strength,'medium');
 assert.throws(()=>validateGenerationInput({...input,strength:0.8}));
 assert.throws(()=>validateGenerationInput({...input,preserveIdentity:true}));
 assert.throws(()=>validateGenerationInput({...input,referenceId:undefined}));
});
test('Z graph encodes the resized reference and uses a fixed eight effective steps',async()=>{
 const raw=JSON.parse(await readFile(new URL('../workflows/z-image-edit.api.json',import.meta.url),'utf8')) as ApiGraph;
 const info:NodeInfo=Object.fromEntries(Object.values(raw).map(n=>[n.class_type,{input:{required:{}}}]));
 for(const n of Object.values(raw))for(const k of ['unet_name','clip_name','vae_name'])if(k in n.inputs)info[n.class_type].input.required![k]=[[n.inputs[k]]];
 for(const [strength,denoise] of [['weak',0.35],['medium',0.6],['strong',0.85]] as const){
 const g=compileZImageEdit(raw,{modelId:'z-image-edit',prompt:'cafe',sizeId:'landscape',referenceId,strength},`ComfyStudio/references/${referenceId}.png`,info);
 assert.deepEqual(g.sampler.inputs.latent_image,['latent',0]);assert.deepEqual(g.latent.inputs.pixels,['resize',0]);
 assert.deepEqual(g.resize.inputs.image,['reference',0]);assert.equal(g.resize.inputs.width,1152);
 assert.equal(g.sampler.inputs.denoise,denoise);assert.equal(g.sampler.inputs.steps,8);assert.equal(g.positive.inputs.text,'cafe');
 }
 assert.throws(()=>compileZImageEdit(raw,{modelId:'z-image-edit',prompt:'cafe',sizeId:'square',referenceId},'../../secret',info));
});
test('only public PWA files bypass login, private media remain protected',()=>{
 for(const p of ['/manifest.webmanifest','/sw.js','/offline.html','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png'])assert.equal(authDecision(p,false,true),'allow');
 assert.equal(authDecision('/api/references/a/image',false,true),'unauthorized');
 assert.equal(authDecision('/icons/private.png',false,true),'login');
});
