import {readFile} from 'node:fs/promises';import path from 'node:path';import {randomInt} from 'node:crypto';import {compileStoredGraph} from '../stored-workflow.ts';import {validateGraphModels} from '../jobs.ts';import type {ApiGraph,NodeInfo} from '../types.ts';import type {MusicInput} from './types.ts';import {validateMusicInput} from './validation.ts';
export const MUSIC_CHECKPOINT='ace_step_1.5_turbo_aio.safetensors';
// ACE-Step 1.5 XL turbo (MIT): 4B DiT with the 4B planner LM. Same 8-step, CFG-free sampling as the stored turbo graph.
export const MUSIC_XL={unet:'acestep_v1.5_xl_turbo_bf16.safetensors',clip:['qwen_0.6b_ace15.safetensors','qwen_4b_ace15.safetensors'],vae:'ace_1.5_vae.safetensors'} as const;
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
 const [,loader]=one('CheckpointLoaderSimple');
 if(loader.inputs.ckpt_name!==MUSIC_CHECKPOINT)throw Error('저장된 음악 워크플로 구조를 확인해 주세요: 모델');
 // Swap the stored all-in-one turbo checkpoint for the split XL loaders, rewiring its MODEL/CLIP/VAE outputs.
 const [loaderKey]=one('CheckpointLoaderSimple');if(graph.studio_xl_unet||graph.studio_xl_clip||graph.studio_xl_vae)throw Error('음악 모델 노드가 충돌했습니다.');
 graph.studio_xl_unet={class_type:'UNETLoader',inputs:{unet_name:MUSIC_XL.unet,weight_dtype:'default'}};
 graph.studio_xl_clip={class_type:'DualCLIPLoader',inputs:{clip_name1:MUSIC_XL.clip[0],clip_name2:MUSIC_XL.clip[1],type:'ace',device:'default'}};
 graph.studio_xl_vae={class_type:'VAELoader',inputs:{vae_name:MUSIC_XL.vae}};
 const outputs=['studio_xl_unet','studio_xl_clip','studio_xl_vae'];delete graph[loaderKey];
 for(const node of Object.values(graph))for(const [name,value] of Object.entries(node.inputs))if(Array.isArray(value)&&value[0]===loaderKey)node.inputs[name]=[outputs[Number(value[1])],0];
 one('TextEncodeAceStepAudio1.5');one('EmptyAceStep1.5LatentAudio');const [,sampler]=one('KSampler');
 if(sampler.inputs.steps!==8||sampler.inputs.cfg!==1||sampler.inputs.sampler_name!=='euler'||sampler.inputs.scheduler!=='simple'||sampler.inputs.denoise!==1)throw Error('저장된 음악 샘플링 설정을 확인해 주세요.');
 if(input.durationMode==='auto'){
  const [encoderKey,encoder]=one('TextEncodeAceStepAudio1.5'),[emptyKey]=one('EmptyAceStep1.5LatentAudio');
  const voice=input.mode==='vocal'&&input.vocalGender!=='auto'?`, ${input.vocalGender} solo vocal`:'';
  graph[encoderKey]={class_type:'ComfyStudioMusicAuto',inputs:{clip:encoder.inputs.clip,tags:String(encoder.inputs.tags)+voice+', complete song, resolved outro, natural musical ending',lyrics:encoder.inputs.lyrics,language:input.language,seed,bpm:encoder.inputs.bpm,keyscale:encoder.inputs.keyscale,timesignature:encoder.inputs.timesignature}};
  sampler.inputs.latent_image=[encoderKey,1];delete graph[emptyKey];
 }
 const [decoderKey,decoder]=one('VAEDecodeAudio');graph[decoderKey]={class_type:'VAEDecodeAudioTiled',inputs:{...decoder.inputs,tile_size:512,overlap:64}};
 const [,save]=one('SaveAudioAdvanced');if(graph.studio_mp3)throw Error('음악 저장 노드가 충돌했습니다.');graph.studio_mp3={class_type:'SaveAudioMP3',inputs:{audio:save.inputs.audio,filename_prefix:'ComfyStudio/music/preview',quality:'320k'}};
 const installed=(type:string,key:string,name:string)=>{const spec=info[type]?.input.required?.[key];return Array.isArray(spec?.[0])&&(spec[0] as unknown[]).includes(name);};
 if(!installed('UNETLoader','unet_name',MUSIC_XL.unet)||!MUSIC_XL.clip.every(c=>installed('DualCLIPLoader','clip_name1',c))||!installed('VAELoader','vae_name',MUSIC_XL.vae))throw Error('승인된 음악 모델(ACE-Step 1.5 XL)을 찾을 수 없습니다.');
 validateGraphModels(graph,info);return graph;
}
