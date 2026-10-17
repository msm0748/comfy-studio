import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getPreset } from './presets.ts';
import { validateGraphModels,assertJobId } from './jobs.ts';
import type { ApiGraph,GenerationInput,NodeInfo } from './types.ts';

export async function loadEditWorkflow():Promise<unknown>{
  return JSON.parse(await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ process.cwd(),'workflows','qwen-image-edit-2511.api.json'),'utf8'));
}
export function compileEditWorkflow(raw:unknown,input:GenerationInput,referenceFilename:string,nodeInfo:NodeInfo):ApiGraph{
  if(input.modelId!=='qwen-edit-2511'||!input.referenceId)throw new Error('편집 모델과 참조 이미지를 확인해 주세요.');
  assertJobId(input.referenceId);
  if(referenceFilename!==`ComfyStudio/references/${input.referenceId}.png`)throw new Error('참조 이미지 경로를 확인해 주세요.');
  const graph=structuredClone(raw) as ApiGraph;
  const classes:Record<string,string>={model:'UNETLoader',lora:'LoraLoaderModelOnly',sampling:'ModelSamplingAuraFlow',norm:'CFGNorm',clip:'CLIPLoader',vae:'VAELoader',reference:'LoadImage',reference_scale:'ImageScaleToTotalPixels',positive:'TextEncodeQwenImageEditPlus',negative:'TextEncodeQwenImageEditPlus',latent:'EmptySD3LatentImage',sampler:'KSampler',decode:'VAEDecode',save:'SaveImage'};
  if(!graph||Object.keys(graph).length!==Object.keys(classes).length||Object.entries(classes).some(([id,type])=>graph[id]?.class_type!==type))throw new Error('저장된 편집 워크플로 구조를 확인해 주세요.');
  const files={model:['unet_name','qwen_image_edit_2511_fp8mixed.safetensors'],clip:['clip_name','qwen_2.5_vl_7b_fp8_scaled.safetensors'],vae:['vae_name','qwen_image_vae.safetensors'],lora:['lora_name','Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors']};
  for(const [id,[key,name]] of Object.entries(files))if(graph[id].inputs[key]!==name)throw new Error('상업용으로 확인된 편집 모델 파일만 사용할 수 있습니다.');
  if(JSON.stringify(graph.positive.inputs.image1)!==JSON.stringify(['reference_scale',0])||JSON.stringify(graph.reference_scale.inputs.image)!==JSON.stringify(['reference',0]))throw new Error('편집 참조 이미지 연결이 없습니다.');
  const size=getPreset(input.modelId).sizes.find(s=>s.id===input.sizeId);if(!size)throw new Error('지원하지 않는 편집 크기입니다.');
  graph.reference.inputs.image=referenceFilename;
  graph.positive.inputs.prompt=(input.preserveIdentity!==false?'Preserve the identity, facial features, and recognizable appearance of the person in the reference image. Apply only the requested changes.\n\n':'')+input.prompt;
  Object.assign(graph.latent.inputs,{width:size.width,height:size.height,batch_size:1});
  graph.sampler.inputs.seed=randomInt(0,2**48-1);
  graph.save.inputs.filename_prefix='ComfyStudio/qwen-edit-2511';
  validateGraphModels(graph,nodeInfo);return graph;
}
