import {readFile} from 'node:fs/promises';import path from 'node:path';import {randomInt} from 'node:crypto';
import {validateGraphModels} from '../jobs.ts';import type {ApiGraph,NodeInfo} from '../types.ts';import type {SwapTarget} from './types.ts';
export const SWAP_LORA='v2-1000.safetensors';export const SWAP_SAM='sam3.1_multiplex_fp16.safetensors';
export async function loadSwapWorkflow():Promise<ApiGraph>{const root=process.env.COMFYUI_CUSTOM_NODES_DIR||'C:/ComfyUI/ComfyUI_windows_portable/ComfyUI/custom_nodes';return JSON.parse((await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ root,'h3-relay/example_workflows/toolkit/H3-Character-Swap.api.json'),'utf8')).replace(/^\uFEFF/,''));}
export function swapPrompt(target:SwapTarget,description:string):string{return `Replace ${target==='all'?'every person':'the selected person'} in <Video 1> with the character in <Picture 1>: ${description.trim().replace(/[\s.]+$/,'')}. Keep the reference character's face, hair and clothing. The original appearance must not remain. Follow the source performance's pose, gaze, expression and movement. Preserve the background, the framing and every cut.`;}
type Options={target:SwapTarget;description:string;sourceFile:string;referenceFile:string;width:number;height:number;frames:number};
const MASK_NODES=['mask_preview','expand_mask','recover','mask','track','select','detect','subject','first_frame','sam'];
export function compileSwapWorkflow(raw:ApiGraph,o:Options,info:NodeInfo):ApiGraph{
 const g=structuredClone(raw);
 for(const key of ['source','reference','prepare','adapter','plan','window','reference_conditioning','save',...MASK_NODES])if(!g[key])throw new Error('인물 교체 워크플로 구조를 확인해 주세요: '+key);
 const loras=info.LoraLoaderModelOnly?.input.required?.lora_name?.[0];const lora=Array.isArray(loras)?(loras as string[]).find(name=>name.split(/[\\/]/).pop()===SWAP_LORA):undefined;
 if(!lora)throw new Error('인물 교체 LoRA를 찾을 수 없습니다.');
 g.adapter.inputs.lora_name=lora;g.source.inputs.file=o.sourceFile;g.reference.inputs.image=o.referenceFile;g.reference_conditioning.inputs.prompt=swapPrompt(o.target,o.description);g.plan.inputs.seed=randomInt(0,2**48-1);g.save.inputs.filename_prefix='ComfyStudio/swap/result';
 // The source is already normalized with the bundled FFmpeg; H3RelayPrepareSource needs ffprobe on PATH, which this PC lacks.
 delete g.prepare;g.studio_components={class_type:'GetVideoComponents',inputs:{video:['source',0]}};g.studio_frames={class_type:'PrimitiveInt',inputs:{value:o.frames}};
 const outputs:Record<number,[string,number]>={0:['studio_components',0],1:['studio_components',1],5:['studio_frames',0]};
 for(const node of Object.values(g))for(const [name,value] of Object.entries(node.inputs))if(Array.isArray(value)&&value[0]==='prepare'){const out=outputs[Number(value[1])];if(!out)throw new Error('인물 교체 워크플로 구조를 확인해 주세요: prepare');node.inputs[name]=out;}
 if(o.target==='all'){
  // Tracking follows one person and loses them at cuts, so "everyone" regenerates the whole frame.
  for(const key of MASK_NODES)delete g[key];
  g.studio_mask_solid={class_type:'SolidMask',inputs:{value:1,width:o.width,height:o.height}};
  g.studio_mask_image={class_type:'MaskToImage',inputs:{mask:['studio_mask_solid',0]}};
  g.studio_mask_batch={class_type:'RepeatImageBatch',inputs:{image:['studio_mask_image',0],amount:o.frames}};
  g.studio_mask={class_type:'ImageToMask',inputs:{image:['studio_mask_batch',0],channel:'red'}};
  g.window.inputs.mask=['studio_mask',0];
 }else{const spec=info.CheckpointLoaderSimple?.input.required?.ckpt_name?.[0];if(!Array.isArray(spec)||!spec.includes(SWAP_SAM))throw new Error('인물 인식 모델(SAM 3.1)을 찾을 수 없습니다.');}
 validateGraphModels(g,info);return g;
}
