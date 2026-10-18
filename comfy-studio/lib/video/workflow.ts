import {readFile} from 'node:fs/promises';import path from 'node:path';import {randomInt} from 'node:crypto';
import {compileStoredGraph} from '../stored-workflow.ts';import {validateGraphModels} from '../jobs.ts';
import type {ApiGraph,NodeInfo} from '../types.ts';import type {VideoInput,VideoMode} from './types.ts';
import {videoFrames} from './presets.ts';import {validateVideoInput} from './validation.ts';
const FILES={text:'MiniMax-H3-T2V-7s-Single-Shot.json',image:'MiniMax-H3-I2V-7s-RTX3090.json'};
export async function loadVideoWorkflow(mode:VideoMode):Promise<unknown>{const root=process.env.COMFYUI_WORKFLOW_DIR||'C:/ComfyUI/ComfyUI_windows_portable/ComfyUI/user/default/workflows';return JSON.parse((await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ root,FILES[mode]),'utf8')).replace(/^\uFEFF/,''));}
export function compileVideoWorkflow(raw:unknown,input:VideoInput,info:NodeInfo,referenceFilename?:string):ApiGraph{
 validateVideoInput(input);
 if(input.mode==='image'&&referenceFilename!==`ComfyStudio/references/${input.referenceId}.png`)throw new Error('안전한 영상 참조 이미지를 확인해 주세요.');
 const graph=compileStoredGraph(raw,info,{outputTypes:['SaveVideo'],strictSchema:true,patch:({type,inputs})=>{
  if(type==='MiniMaxH3ImageToVideo')Object.assign(inputs,{prompt:input.prompt,width:864,height:480,length:videoFrames(input.durationSeconds)});
  if(type==='LoadImage')inputs.image=referenceFilename;
  if(type==='RandomNoise')inputs.noise_seed=randomInt(0,2**48-1);
  if(type==='CreateVideo')inputs.fps=24;
  if(type==='SaveVideo')Object.assign(inputs,{filename_prefix:'ComfyStudio/video/'+((input.upscale??'fast')==='fast'?'original':input.resolution),format:'mp4','format.codec':'h264','format.codec.encoding':'auto'});
 }});
 const one=(type:string)=>{const entries=Object.entries(graph).filter(([,n])=>n.class_type===type);if(entries.length!==1)throw new Error('영상 워크플로 구조를 확인해 주세요: '+type);return entries[0];};
 const [,h3]=one('MiniMaxH3ImageToVideo');if(input.mode==='text')delete h3.inputs.first_frame;
 if(input.mode==='image'&&!h3.inputs.first_frame)throw new Error('영상 참조 연결이 없습니다.');
 const [decodeKey,decode]=one('VAEDecode');const [,video]=one('CreateVideo');
 if(input.upscale==='ai'&&input.resolution!=='480p'){
  const [,sampler]=one('SamplerCustomAdvanced');const [,guider]=one('BasicGuider');const original=decode.inputs.samples;
  const add=(id:string,type:string,inputs:Record<string,unknown>):[string,number]=>{if(graph[id])throw new Error('영상 노드 번호가 충돌했습니다.');graph[id]={class_type:type,inputs};return [id,0];};
  const nativeDecode=add('studio_original_decode','VAEDecode',{...decode.inputs});
  const nativeVideo=add('studio_original_video','CreateVideo',{...video.inputs,images:nativeDecode});
  const [,save]=one('SaveVideo');add('studio_original_save','SaveVideo',{...save.inputs,video:nativeVideo,filename_prefix:'ComfyStudio/video/original'});
  const split=add('studio_split','LTXVSeparateAVLatent',{av_latent:original});
  const modelName='minimax_h3_latent_upscaler_3d_conv_v1\\minimax_h3_latent_upscaler_3d_conv_v1_bf16.safetensors';
  const up=add('studio_up','MinimaxH3LatentUpscaler3D',{latent:split,model_name:modelName,mode:'target dimensions','mode.width':1280,'mode.height':736,align:32,enable_temporal_chunking:true,force_unload:true,device:'cuda',precision:'bf16'});
  const av=add('studio_av','LTXVConcatAVLatent',{video_latent:up,audio_latent:['studio_split',1]});
  const sigmas=add('studio_sigmas','BasicScheduler',{model:guider.inputs.model,scheduler:'simple',steps:6,denoise:0.3});
  const temporal=add('studio_temporal','MMH3TemporalSplitParamsV10',{chunk_frames:73,temporal_overlap_frames:22,anchor_strength:0.999,motion_anchor_frames:'22',identity_anchor_frames:24});
  const spatial=add('studio_spatial','MMH3SpatialSplitParamsV10',{tile_width:512,tile_height:512,overlap_ratio:0.25,fade_ratio:0.5,min_tile_size:256,seam_denoise:0.7});
  const refined=add('studio_refined','MMH3SplitUpscale',{model:guider.inputs.model,conditioning:guider.inputs.conditioning,latent:av,noise:sampler.inputs.noise,sampler:sampler.inputs.sampler,sigmas,cfg:1,seam_polish:'off',color_match:true,temporal_split_param:temporal,spatial_split_param:spatial});
  graph[decodeKey]={class_type:'VAEDecodeTiled',inputs:{samples:refined,vae:decode.inputs.vae,tile_size:512,overlap:64,temporal_size:32,temporal_overlap:8}};
  const crop=add('studio_crop','ImageCrop',{image:[decodeKey,0],width:1280,height:720,x:0,y:8});video.inputs.images=crop;
 }
 validateVideoGraph(graph,info);return graph;
}
export function compileVideoEnhancement(raw:unknown,input:VideoInput,info:NodeInfo,filename:string):ApiGraph{
 if(!input.sourceJobId||input.upscale!=='ai'||filename!==`ComfyStudio/video-sources/${input.sourceJobId}.mp4`)throw new Error('안전한 원본 영상 입력을 확인해 주세요.');
 const graph=compileVideoWorkflow(raw,{...input,mode:'text',referenceId:undefined,sourceJobId:undefined},info);
 const [,videoVae]=Object.entries(graph).find(([,n])=>n.class_type==='VAEDecodeTiled')!;
 const audioVae=Object.values(graph).find(n=>n.class_type==='VAEDecodeAudio')!.inputs.vae;
 graph.studio_source_video={class_type:'LoadVideo',inputs:{file:filename}};
 graph.studio_source_components={class_type:'GetVideoComponents',inputs:{video:['studio_source_video',0]}};
 graph.studio_source_scale={class_type:'ImageScale',inputs:{image:['studio_source_components',0],upscale_method:'lanczos',width:864,height:480,crop:'center'}};
 graph.studio_source_encoded_video={class_type:'VAEEncodeTiled',inputs:{pixels:['studio_source_scale',0],vae:videoVae.inputs.vae,tile_size:512,overlap:64,temporal_size:32,temporal_overlap:8}};
 graph.studio_source_encoded_audio={class_type:'VAEEncodeAudio',inputs:{audio:['studio_source_components',1],vae:audioVae}};
 graph.studio_source_encoded_av={class_type:'LTXVConcatAVLatent',inputs:{video_latent:['studio_source_encoded_video',0],audio_latent:['studio_source_encoded_audio',0]}};
 graph.studio_split.inputs.av_latent=['studio_source_encoded_av',0];
 Object.values(graph).find(n=>n.class_type==='CreateVideo')!.inputs.audio=['studio_source_components',1];
 delete graph.studio_original_save;
 const retained:ApiGraph={};function visit(key:string){if(retained[key])return;const node=graph[key];if(!node)throw new Error('영상 보정 연결을 확인해 주세요.');retained[key]=node;for(const value of Object.values(node.inputs))if(Array.isArray(value)&&typeof value[0]==='string'&&typeof value[1]==='number')visit(value[0]);}
 for(const [key,node] of Object.entries(graph))if(node.class_type==='SaveVideo')visit(key);
 if(Object.values(retained).some(node=>node.class_type==='SamplerCustomAdvanced'))throw new Error('원본 생성 단계가 보정에 연결되었습니다.');
 validateVideoGraph(retained,info);return retained;
}
export function validateVideoGraph(graph:ApiGraph,info:NodeInfo):void{
 validateGraphModels(graph,info);
 const allowed={unet_name:['minimax_h3_fl2va_pruned_int8_convrot.safetensors'],clip_name:['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'],vae_name:['minimax_h3_video_vae_int8_convrot.safetensors','minimax_h3_video_vae_fp16.safetensors','minimax_h3_audio_vae_fp32.safetensors']};
 for(const node of Object.values(graph)){
  for(const [key,values] of Object.entries(allowed))if(key in node.inputs&&!values.includes(String(node.inputs[key])))throw new Error('승인되지 않은 영상 모델입니다.');
  if(node.class_type==='MinimaxH3LatentUpscaler3D'){
   const spec=info[node.class_type]?.input.required?.model_name;const options=Array.isArray(spec?.[0])?spec[0]:(spec?.[1] as {options?:unknown[]}|undefined)?.options;if(!Array.isArray(options)||!options.includes(node.inputs.model_name))throw new Error('영상 업스케일 모델이 없습니다.');
  }
 }
}
