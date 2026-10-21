import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomInt} from 'node:crypto';
import type {ApiGraph,GenerationInput,NodeInfo,Preset} from './types.ts';
import {compileStoredGraph} from './stored-workflow.ts';
// Node inside each stored template's subgraph that receives the prompt, and its input name.
const PROMPT_NODES={'z-image':[27,'text'],'qwen-2512':[227,'text'],'krea-2':[19,'value'],'moss-image':[17,'value']} as const;
const QWEN_NEGATIVE_EXTRA='塑料质感，过度锐化，完美无瑕的皮肤，HDR过度处理';
export async function loadWorkflow(preset: Preset): Promise<unknown> {
  const root = process.env.COMFYUI_WORKFLOW_DIR || 'C:/ComfyUI/ComfyUI_windows_portable/ComfyUI/user/default/workflows';
  // Workflows intentionally live outside the Next.js application and are read at runtime.
  return JSON.parse((await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ root,preset.workflowFile),'utf8')).replace(/^\uFEFF/,''));
}

export function compileWorkflow(preset:Preset,raw:unknown,input:GenerationInput,nodeInfo:NodeInfo):ApiGraph{
 const size=preset.sizes.find(s=>s.id===input.sizeId);if(!size)throw new Error('지원하지 않는 사이즈입니다.');
 return compileStoredGraph(raw,nodeInfo,{outputTypes:['SaveImage'],patch:({nodeId,type,inputs,nested,widgets})=>{
  if(['EmptySD3LatentImage','EmptyLatentImage','EmptyFlux2LatentImage'].includes(type))Object.assign(inputs,{width:size.width,height:size.height,batch_size:1});
  const [promptNode,promptKey]=PROMPT_NODES[preset.id as keyof typeof PROMPT_NODES]??[-1,'text'];
  if(nodeId===promptNode&&nested)inputs[promptKey]=input.prompt;
  // Qwen 2512 runs true CFG 4, so its negative prompt works; extend the official "AI感" list with plastic-skin cues.
  if(preset.id==='qwen-2512'&&nodeId===228&&nested&&typeof inputs.text==='string'&&!inputs.text.includes(QWEN_NEGATIVE_EXTRA))inputs.text=inputs.text.replace(/[。，,\s]+$/,'')+'，'+QWEN_NEGATIVE_EXTRA;
  if(type==='KSampler'&&widgets[1]==='randomize')inputs.seed=randomInt(0,2**48-1);
  if(type==='SaveImage')inputs.filename_prefix='ComfyStudio/'+preset.id;
 }});
}
