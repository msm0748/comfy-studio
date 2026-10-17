import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomInt} from 'node:crypto';
import type {ApiGraph,GenerationInput,NodeInfo,Preset} from './types.ts';
import {compileStoredGraph} from './stored-workflow.ts';
export async function loadWorkflow(preset: Preset): Promise<unknown> {
  const root = process.env.COMFYUI_WORKFLOW_DIR || 'C:/ComfyUI/ComfyUI_windows_portable/ComfyUI/user/default/workflows';
  // Workflows intentionally live outside the Next.js application and are read at runtime.
  return JSON.parse((await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ root,preset.workflowFile),'utf8')).replace(/^\uFEFF/,''));
}

export function compileWorkflow(preset:Preset,raw:unknown,input:GenerationInput,nodeInfo:NodeInfo):ApiGraph{
 const size=preset.sizes.find(s=>s.id===input.sizeId);if(!size)throw new Error('지원하지 않는 사이즈입니다.');
 return compileStoredGraph(raw,nodeInfo,{outputTypes:['SaveImage'],patch:({nodeId,type,inputs,nested,widgets})=>{
  if(['EmptySD3LatentImage','EmptyLatentImage'].includes(type))Object.assign(inputs,{width:size.width,height:size.height,batch_size:1});
  const promptNode=preset.id==='z-image'?27:preset.id==='qwen-2512'?227:19;
  if(nodeId===promptNode&&nested)inputs[preset.id==='krea-2'?'value':'text']=input.prompt;
  if(type==='KSampler'&&widgets[1]==='randomize')inputs.seed=randomInt(0,2**48-1);
  if(type==='SaveImage')inputs.filename_prefix='ComfyStudio/'+preset.id;
 }});
}
