import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getPreset } from './presets.ts';
import { assertJobId,validateGraphModels } from './jobs.ts';
import type { ApiGraph,GenerationInput,NodeInfo } from './types.ts';
export async function loadZImageEdit():Promise<unknown>{return JSON.parse(await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ process.cwd(),'workflows','z-image-edit.api.json'),'utf8'));}
export function compileZImageEdit(raw:unknown,input:GenerationInput,filename:string,info:NodeInfo):ApiGraph{
 if(input.modelId!=='z-image-edit'||!input.referenceId)throw new Error('참조 이미지를 선택해 주세요.');
 assertJobId(input.referenceId);
 if(filename!==`ComfyStudio/references/${input.referenceId}.png`)throw new Error('참조 이미지 경로를 확인해 주세요.');
 const g=structuredClone(raw) as ApiGraph;
 const classes={save:'SaveImage',decode:'VAEDecode',sampler:'KSampler',sampling:'ModelSamplingAuraFlow',model:'UNETLoader',positive:'CLIPTextEncode',clip:'CLIPLoader',negative:'ConditioningZeroOut',latent:'VAEEncode',vae:'VAELoader',reference:'LoadImage',resize:'ImageScale'};
 if(!g||Object.keys(g).length!==Object.keys(classes).length||Object.entries(classes).some(([k,v])=>g[k]?.class_type!==v))throw new Error('Z-Image 편집 워크플로 구조를 확인해 주세요.');
 if(g.model.inputs.unet_name!=='z_image_turbo_bf16.safetensors'||g.clip.inputs.clip_name!=='qwen_3_4b.safetensors'||g.vae.inputs.vae_name!=='ae.safetensors')throw new Error('승인된 Z-Image 모델만 사용할 수 있습니다.');
 for(const [node,key,target] of [['sampler','latent_image','latent'],['latent','pixels','resize'],['resize','image','reference']])if(JSON.stringify(g[node].inputs[key])!==JSON.stringify([target,0]))throw new Error('참조 이미지 연결을 확인해 주세요.');
 const size=getPreset(input.modelId).sizes.find(s=>s.id===input.sizeId);if(!size)throw new Error('편집 크기를 확인해 주세요.');
 const denoise={weak:0.35,medium:0.6,strong:0.85}[input.strength??'medium'];if(!denoise)throw new Error('변경 강도를 확인해 주세요.');
 g.reference.inputs.image=filename;Object.assign(g.resize.inputs,{width:size.width,height:size.height});
 g.positive.inputs.text=input.prompt;Object.assign(g.sampler.inputs,{seed:randomInt(0,2**48-1),denoise});
 validateGraphModels(g,info);return g;
}
