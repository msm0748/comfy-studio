import {readFile} from 'node:fs/promises';import path from 'node:path';import {randomInt} from 'node:crypto';import {compileStoredGraph} from '../stored-workflow.ts';import {validateGraphModels} from '../jobs.ts';import type {ApiGraph,NodeInfo} from '../types.ts';import type {MusicInput} from './types.ts';import {validateMusicInput} from './validation.ts';
export const MUSIC_CHECKPOINT='ace_step_1.5_turbo_aio.safetensors';
export async function loadMusicWorkflow(){return JSON.parse((await readFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ process.env.COMFYUI_WORKFLOW_DIR??'C:/ComfyUI/ComfyUI_windows_portable/ComfyUI/user/default/workflows','ACE-Step-1.5-Music-Generation.json'),'utf8')).replace(/^\uFEFF/,''));}
export function compileMusicWorkflow(raw:unknown,input:MusicInput,info:NodeInfo,translatedStyle?:string):ApiGraph{
 validateMusicInput(input);const style=translatedStyle??input.prompt;if(typeof style!=='string'||!style.trim()||style.length>32000)throw Error('번역된 분위기 설명을 확인해 주세요.');const seed=randomInt(0,2**48-1);
 const graph=compileStoredGraph(raw,info,{outputTypes:['SaveAudioAdvanced'],patch:({type,inputs})=>{
  if(type==='TextEncodeAceStepAudio1.5')Object.assign(inputs,{tags:style+(input.mode==='instrumental'?', instrumental, no vocals':''),lyrics:input.mode==='instrumental'?'[Instrumental]':input.lyrics,language:input.language,duration:input.durationSeconds,seed});
  if(type==='EmptyAceStep1.5LatentAudio')Object.assign(inputs,{seconds:input.durationSeconds,batch_size:1});
  if(type==='KSampler')inputs.seed=seed;
  if(type==='SaveAudioAdvanced')Object.assign(inputs,{filename_prefix:'ComfyStudio/music/original',format:'flac'});
 }});
 const one=(type:string)=>{const found=Object.entries(graph).filter(([,node])=>node.class_type===type);if(found.length!==1)throw Error('저장된 음악 워크플로 구조를 확인해 주세요: '+type);return found[0];};
 const [,loader]=one('CheckpointLoaderSimple'),spec=info.CheckpointLoaderSimple?.input.required?.ckpt_name;
 if(loader.inputs.ckpt_name!==MUSIC_CHECKPOINT||!Array.isArray(spec?.[0])||!spec[0].includes(MUSIC_CHECKPOINT))throw Error('승인된 음악 모델을 찾을 수 없습니다.');
 one('TextEncodeAceStepAudio1.5');one('EmptyAceStep1.5LatentAudio');const [,sampler]=one('KSampler');
 if(sampler.inputs.steps!==8||sampler.inputs.cfg!==1||sampler.inputs.sampler_name!=='euler'||sampler.inputs.scheduler!=='simple'||sampler.inputs.denoise!==1)throw Error('저장된 음악 샘플링 설정을 확인해 주세요.');
 const [decoderKey,decoder]=one('VAEDecodeAudio');graph[decoderKey]={class_type:'VAEDecodeAudioTiled',inputs:{...decoder.inputs,tile_size:512,overlap:64}};
 const [,save]=one('SaveAudioAdvanced');if(graph.studio_mp3)throw Error('음악 저장 노드가 충돌했습니다.');graph.studio_mp3={class_type:'SaveAudioMP3',inputs:{audio:save.inputs.audio,filename_prefix:'ComfyStudio/music/preview',quality:'320k'}};
 validateGraphModels(graph,info);return graph;
}
