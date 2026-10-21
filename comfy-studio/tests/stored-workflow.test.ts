import test from 'node:test';import assert from 'node:assert/strict';
import {compileStoredGraph} from '../lib/stored-workflow.ts';
import type {NodeInfo} from '../lib/types.ts';
// Subgraph exposing seed (promoted, no outer port), steps (outer widget port) and an IMAGE socket.
const info:NodeInfo={Sampler:{input:{required:{seed:['INT',{}],steps:['INT',{}]}},output:['LATENT']},Save:{input:{required:{latent:['LATENT',{}]}},output:[]}};
const sub={id:'sg',inputNode:{id:-10},outputNode:{id:-20},inputs:[{name:'image'},{name:'seed'},{name:'steps'}],nodes:[{id:1,type:'Sampler',inputs:[{name:'seed',link:11,widget:{name:'seed'}},{name:'steps',link:12,widget:{name:'steps'}}],widgets_values:[0,1]}],
 links:[{id:11,origin_id:-10,origin_slot:1,target_id:1,target_slot:0,type:'INT'},{id:12,origin_id:-10,origin_slot:2,target_id:1,target_slot:1,type:'INT'},{id:13,origin_id:1,origin_slot:0,target_id:-20,target_slot:0,type:'LATENT'}]};
const workflow=(values:unknown[])=>({definitions:{subgraphs:[sub]},nodes:[{id:5,type:'sg',inputs:[{name:'image',link:null},{name:'steps',link:null,widget:{name:'steps'}}],widgets_values:values},{id:6,type:'Save',inputs:[{name:'latent',link:20}]}],links:[[20,5,0,6,0,'LATENT']]});
const sampler=(values:unknown[])=>Object.values(compileStoredGraph(workflow(values),info,{outputTypes:['Save'],patch:()=>{}})).find(n=>n.class_type==='Sampler')!.inputs;
test('subgraph values map per widget port in old saves and per promoted input in new saves',()=>{
 assert.deepEqual([sampler([30]).seed,sampler([30]).steps],[0,30]);
 assert.deepEqual([sampler([42,25]).seed,sampler([42,25]).steps],[42,25]);
});
