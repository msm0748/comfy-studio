import {randomInt} from 'node:crypto';
import {validateGraphModels} from '../jobs.ts';
import type {ApiGraph,NodeInfo} from '../types.ts';import type {VideoInput} from './types.ts';
import {videoFrames,videoLayout} from './presets.ts';import {validateVideoInput} from './validation.ts';
export const SINGULARITY_UNET='Minimax-h3_Singularity_ref2va_v2_pruned_int8.safetensors';
const SINGULARITY_LORA='minimax_h3_ref2v_lightx2v_turbo_4step_v0.1_resized_avg_rank_20_bf16.safetensors';
// Beta schedule (8 steps, shift 12) with one extra step below sigma 0.7, split after step 4; values from the 2026-10-30 tests.
const SINGULARITY_SIGMAS={base:'1.000000, 0.994988, 0.982512, 0.960745, 0.923360',refine:'0.923360, 0.855292, 0.720733, 0.424908, 0.212454, 0.000000'};
const LATENT_UPSCALER='minimax_h3_latent_upscaler_3d_conv_v1\\minimax_h3_latent_upscaler_3d_conv_v1_bf16.safetensors';
export function compileVideoWorkflow(input:VideoInput,info:NodeInfo,referenceFilename?:string):ApiGraph{
 validateVideoInput(input);
 if(input.mode==='image'&&referenceFilename!==`ComfyStudio/references/${input.referenceId}.png`)throw new Error('안전한 영상 참조 이미지를 확인해 주세요.');
 const graph=compileSingularity(input,referenceFilename);validateVideoGraph(graph,info);return graph;
}
// Generates at 864x480, upscales the latent and resamples at 1280x736, then crops to 720p (the reverse when portrait).
function compileSingularity(input:VideoInput,referenceFilename?:string):ApiGraph{
 const frames=videoFrames(input.durationSeconds),{base,refine,crop}=videoLayout(input.aspect);
 // First-frame conditioning is tied to the latent size, so each pass gets its own at that pass's resolution.
 // MiniMaxH3ImageToVideo stretches first_frame to fit, so the photo is center-cropped to the pass's aspect first.
 const condition=(frame:string,width:number,height:number)=>({clip:['clip',0],vae:['video_vae',0],prompt:input.prompt,width,height,length:frames,...(input.mode==='image'?{first_frame:[frame,0]}:{})});
 const node=(class_type:string,inputs:Record<string,unknown>)=>({class_type,inputs});
 const scaled=(width:number,height:number)=>node('ImageScale',{image:['image',0],upscale_method:'lanczos',width,height,crop:'center'});
 return {
  unet:node('UNETLoader',{unet_name:SINGULARITY_UNET,weight_dtype:'default'}),
  attention:node('ModelAttentionBackend',{model:['unet',0],attention:'comfy kitchen attention'}),
  shift:node('MiniMaxH3SigmaShift',{model:['attention',0],shift_video:12,shift_audio:3}),
  lora:node('LoraLoaderModelOnly',{model:['shift',0],lora_name:SINGULARITY_LORA,strength_model:1}),
  clip:node('CLIPLoader',{clip_name:'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',type:'minimax',device:'default'}),
  video_vae:node('VAELoader',{vae_name:'minimax_h3_video_vae_fp16.safetensors'}),
  audio_vae:node('VAELoader',{vae_name:'minimax_h3_audio_vae_fp32.safetensors'}),
  ...(input.mode==='image'?{image:node('LoadImage',{image:referenceFilename}),base_frame:scaled(base.width,base.height),refine_frame:scaled(refine.width,refine.height)}:{}),
  noise:node('RandomNoise',{noise_seed:randomInt(0,2**48-1)}),
  sampler:node('KSamplerSelect',{sampler_name:'euler'}),
  base_sigmas:node('ManualSigmas',{sigmas:SINGULARITY_SIGMAS.base}),
  refine_sigmas:node('ManualSigmas',{sigmas:SINGULARITY_SIGMAS.refine}),
  base_condition:node('MiniMaxH3ImageToVideo',condition('base_frame',base.width,base.height)),
  base_guider:node('BasicGuider',{model:['lora',0],conditioning:['base_condition',0]}),
  base:node('SamplerCustomAdvanced',{noise:['noise',0],guider:['base_guider',0],sampler:['sampler',0],sigmas:['base_sigmas',0],latent_image:['base_condition',1]}),
  split:node('LTXVSeparateAVLatent',{av_latent:['base',1]}),
  upscale:node('MinimaxH3LatentUpscaler3D',{latent:['split',0],model_name:LATENT_UPSCALER,mode:'target dimensions','mode.width':refine.width,'mode.height':refine.height,align:32,enable_temporal_chunking:true,force_unload:true,device:'cuda',precision:'fp16'}),
  upscaled:node('LTXVConcatAVLatent',{video_latent:['upscale',0],audio_latent:['split',1]}),
  refine_condition:node('MiniMaxH3ImageToVideo',condition('refine_frame',refine.width,refine.height)),
  refine_guider:node('BasicGuider',{model:['lora',0],conditioning:['refine_condition',0]}),
  refine:node('SamplerCustomAdvanced',{noise:['noise',0],guider:['refine_guider',0],sampler:['sampler',0],sigmas:['refine_sigmas',0],latent_image:['upscaled',0]}),
  decode:node('VAEDecode',{samples:['refine',0],vae:['video_vae',0]}),
  crop:node('ImageCrop',{image:['decode',0],...crop}),
  audio:node('VAEDecodeAudio',{samples:['refine',0],vae:['audio_vae',0]}),
  video:node('CreateVideo',{images:['crop',0],audio:['audio',0],fps:24}),
  save:node('SaveVideo',{video:['video',0],filename_prefix:'ComfyStudio/video/singularity',format:'mp4','format.codec':'h264','format.codec.encoding':'auto'}),
 };
}
export function validateVideoGraph(graph:ApiGraph,info:NodeInfo):void{
 validateGraphModels(graph,info);
 const spec=info.MinimaxH3LatentUpscaler3D?.input.required?.model_name;const options=Array.isArray(spec?.[0])?spec[0]:(spec?.[1] as {options?:unknown[]}|undefined)?.options;if(!Array.isArray(options)||!options.includes(LATENT_UPSCALER))throw new Error('영상 업스케일 모델이 없습니다.');
}
