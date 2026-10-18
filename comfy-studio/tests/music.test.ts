import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,rm,mkdir} from 'node:fs/promises';import path from 'node:path';
import {validateMusicInput} from '../lib/music/validation.ts';import {compileMusicWorkflow} from '../lib/music/workflow.ts';import {createMusicJobs,normalizeMusicHistory,safeMusicOutput} from '../lib/music/jobs.ts';import {handleMusicPost} from '../lib/music/api.ts';
const input={mode:'vocal' as const,prompt:'따뜻한 인디 발라드',lyrics:'[Verse]\n오늘의 작은 빛\n[Chorus]\n함께 걸어가',language:'ko' as const,durationSeconds:60};const file={filename:'song_00001_.mp3',subfolder:'ComfyStudio/music',type:'output' as const};
const fixture=async(name:string)=>JSON.parse(await readFile(new URL('./fixtures/music/'+name+'.json',import.meta.url),'utf8'));
test('music validates lyrics and duration without translating or silently truncating them',()=>{
 assert.deepEqual(validateMusicInput(input),input);assert.equal(validateMusicInput({...input,mode:'instrumental',lyrics:''}).lyrics,'');
 for(const change of [{lyrics:''},{durationSeconds:121},{durationSeconds:14},{durationSeconds:NaN},{language:'forged'},{seed:1},{prompt:' '}])assert.throws(()=>validateMusicInput({...input,...change}));
 assert.throws(()=>validateMusicInput({...input,mode:'instrumental'}));
});
test('music graph binds unchanged lyrics and both durations, shares one seed and decodes with tiling',async()=>{
 const schema=await fixture('node-info'),raw=await fixture('workflow');const graph=compileMusicWorkflow(raw,input,schema),nodes=Object.values(graph);
 const encode=nodes.find(n=>n.class_type==='TextEncodeAceStepAudio1.5')!,sampler=nodes.find(n=>n.class_type==='KSampler')!;
 assert.equal(encode.inputs.lyrics,input.lyrics);assert.equal(encode.inputs.language,'ko');assert.equal(encode.inputs.duration,60);assert.equal(nodes.find(n=>n.class_type==='EmptyAceStep1.5LatentAudio')!.inputs.seconds,60);assert.equal(sampler.inputs.seed,encode.inputs.seed);assert.equal(sampler.inputs.steps,8);assert.ok(nodes.some(n=>n.class_type==='VAEDecodeAudioTiled'));assert.ok(nodes.some(n=>n.class_type==='SaveAudioMP3'));assert.ok(nodes.some(n=>n.class_type==='SaveAudioAdvanced'&&n.inputs.format==='flac'));
 const instrumental=compileMusicWorkflow(raw,{...input,mode:'instrumental',lyrics:'',durationSeconds:120},schema);const e=Object.values(instrumental).find(n=>n.class_type==='TextEncodeAceStepAudio1.5')!;assert.equal(e.inputs.lyrics,'[Instrumental]');assert.match(String(e.inputs.tags),/instrumental/i);
 const missing=structuredClone(schema);delete missing.VAEDecodeAudioTiled;assert.throws(()=>compileMusicWorkflow(raw,input,missing));const missingModel=structuredClone(schema);missingModel.CheckpointLoaderSimple.input.required.ckpt_name[0]=[];assert.throws(()=>compileMusicWorkflow(raw,input,missingModel));
});
test('music history accepts only its two audio outputs and normalizes Windows folders safely',()=>{
 const history={status:{completed:true},outputs:{one:{audio:[file]},two:{audio:[{...file,filename:'original.flac',subfolder:'ComfyStudio\\music'}]}}};const result=normalizeMusicHistory(history);assert.equal(result.state,'completed');assert.equal(result.outputs?.flac?.subfolder,'ComfyStudio/music');assert.equal(normalizeMusicHistory({status:{completed:true},outputs:{}}).state,'failed');
 for(const bad of [{...file,filename:'../x.mp3'},{...file,subfolder:'../secret'},{...file,type:'input'},{...file,filename:'x.exe'}])assert.throws(()=>safeMusicOutput(bad));assert.equal(normalizeMusicHistory({status:{status_str:'error'}}).state,'failed');
});
test('music jobs persist the exact input and recover ambiguous acceptance without queuing twice',async()=>{
 await mkdir('.data/test-tmp',{recursive:true});const directory=await mkdtemp(path.resolve('.data/test-tmp/music-jobs-'));let calls=0;const deps={directory,submit:async()=>{calls++;throw Error('response lost');},inspect:async()=>({state:'completed' as const,outputs:{mp3:file}}),recover:async()=> 'original-prompt'};
 try{let jobs=createMusicJobs(deps);const id=crypto.randomUUID();const first=await jobs.submit(input,id);assert.equal(first.state,'submitting');jobs=createMusicJobs(deps);const duplicate=await jobs.submit(input,id);assert.equal(duplicate.id,id);assert.equal(calls,1);const done=await jobs.get(id);assert.equal(done.promptId,'original-prompt');assert.equal(done.state,'completed');assert.equal(done.input.lyrics,input.lyrics);assert.equal(calls,1);await assert.rejects(()=>jobs.submit({...input,prompt:'different'},id),/같은/);}finally{await rm(directory,{recursive:true,force:true});}
});
test('music API authenticates before reading input and rejects forged origin or settings',async()=>{
 let called=0;const deps={authorize:async()=>{},submit:async()=>{called++;return 'ok';}};const request=(origin='http://studio.local',body:unknown=input)=>new Request('http://studio.local/api/music',{method:'POST',headers:{Origin:origin,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)});
 await assert.rejects(()=>handleMusicPost(request(),{...deps,authorize:async()=>{throw Error('login');}}),/login/);await assert.rejects(()=>handleMusicPost(request('https://example.invalid'),deps));await assert.rejects(()=>handleMusicPost(request('http://studio.local',{...input,model:'forged'}),deps));assert.equal(called,0);assert.equal(await handleMusicPost(request(),deps),'ok');assert.equal(called,1);
});
