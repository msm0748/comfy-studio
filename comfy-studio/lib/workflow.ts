import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import type { ApiGraph, GenerationInput, NodeInfo, Preset } from './types.ts';

type Port = { name: string; link?: number | null; widget?: {name:string} };
type UiNode = { id: number; type: string; mode?: number; inputs?: Port[]; widgets_values?: unknown[] };
type Link = {id:number;origin_id:number;origin_slot:number;target_id:number;target_slot:number};
type UiGraph = {nodes:UiNode[];links:(Link | [number,number,number,number,number,string])[];inputNode?:{id:number};outputNode?:{id:number};inputs?:{name:string}[]};
type Workflow = UiGraph & {definitions?:{subgraphs:(UiGraph & {id:string})[]}};
type Context = { graph:UiGraph; prefix:string; parent?:{context:Context;node:UiNode} };
type Schema = Record<string, unknown[]>;
const valueTypes = new Set(['STRING','INT','FLOAT','BOOLEAN','COMBO','COMFY_DYNAMICCOMBO_V3']);
const controls = new Set(['randomize','fixed','increment','decrement']);
const linksOf = (graph:UiGraph):Link[] => graph.links.map(link => Array.isArray(link) ? {id:link[0],origin_id:link[1],origin_slot:link[2],target_id:link[3],target_slot:link[4]} : link);

export async function loadWorkflow(preset: Preset): Promise<unknown> {
  const root = process.env.COMFYUI_WORKFLOW_DIR || 'C:/ComfyUI/ComfyUI_windows_portable/ComfyUI/user/default/workflows';
  return JSON.parse((await readFile(path.join(root,preset.workflowFile),'utf8')).replace(/^\uFEFF/,''));
}

function widgetInputs(node:UiNode, info:NodeInfo[string] | undefined):Record<string,unknown> {
  const values=node.widgets_values || [];
  let cursor=0;
  const result:Record<string,unknown>={};
  const consume=(schema:Schema,prefix='') => {
    for(const [key,spec] of Object.entries(schema)) {
      const [type,rawConfig]=spec;
      const config=(rawConfig || {}) as Record<string,unknown>;
      if (!Array.isArray(type) && !valueTypes.has(String(type))) continue;
      const name=prefix+key;
      const value=cursor<values.length ? values[cursor++] : config.default;
      if(value!==undefined) result[name]=value;
      if(config.control_after_generate && controls.has(String(values[cursor]))) cursor++;
      if(type==='COMFY_DYNAMICCOMBO_V3') {
        const option=(config.options as {key:string;inputs:{required?:Schema;optional?:Schema}}[] || []).find(o=>o.key===value);
        if(option) {consume(option.inputs.required || {},name+'.');consume(option.inputs.optional || {},name+'.');}
      }
    }
  };
  if(info) {consume(info.input.required || {});consume(info.input.optional || {});}
  return result;
}

/** Compiles only the three registered local templates. Unreachable UI helpers are discarded. */
export function compileWorkflow(preset:Preset, raw:unknown, input:GenerationInput, nodeInfo:NodeInfo):ApiGraph {
  const workflow=structuredClone(raw) as Workflow;
  if(!workflow?.nodes?.length || !Array.isArray(workflow.links)) throw new Error('저장된 워크플로 형식을 확인해 주세요.');
  const size=preset.sizes.find(s=>s.id===input.sizeId);
  if(!size) throw new Error('지원하지 않는 사이즈입니다.');
  const definitions=new Map((workflow.definitions?.subgraphs || []).map(g=>[g.id,g]));
  const root:Context={graph:workflow,prefix:''};
  const graph:ApiGraph={};
  const building=new Set<string>();
  const isRef=(value:unknown):value is [string,number] => Array.isArray(value) && value.length===2 && typeof value[0]==='string' && typeof value[1]==='number';

  function output(context:Context,id:number,slot:number):unknown {
    if(id===context.graph.inputNode?.id) {
      const parent=context.parent;
      if(!parent) throw new Error('서브그래프 입력이 올바르지 않습니다.');
      const name=context.graph.inputs?.[slot]?.name;
      const port=parent.node.inputs?.find(p=>p.name===name);
      if(port?.link!=null) return linked(parent.context,port.link);
      const values=parent.node.widgets_values || [];
      const widgets=(parent.node.inputs || []).filter(p=>p.widget);
      const index=widgets.findIndex(p=>p.name===name);
      if(index>=0 && index<values.length) return values[index];
      return undefined; // Preserve the destination's saved widget when an exposure has no override.
    }
    const node=context.graph.nodes.find(n=>n.id===id);
    if(!node) throw new Error(`워크플로 연결 노드가 없습니다: ${id}`);
    const definition=definitions.get(node.type);
    if(definition) {
      const child:Context={graph:definition,prefix:context.prefix+node.id+':',parent:{context,node}};
      const out=linksOf(definition).find(l=>l.target_id===definition.outputNode?.id && l.target_slot===slot);
      if(!out) throw new Error('서브그래프 출력이 없습니다.');
      return output(child,out.origin_id,out.origin_slot);
    }
    const key=context.prefix+id;
    build(context,node);
    if(['PrimitiveBoolean','PrimitiveInt','PrimitiveFloat'].includes(node.type)) return graph[key].inputs.value;
    if(node.type==='ComfySwitchNode') {
      const toggle=graph[key].inputs.switch;
      if(typeof toggle!=='boolean') throw new Error('저장된 스위치 값을 확인할 수 없습니다.');
      return graph[key].inputs[toggle?'on_true':'on_false'];
    }
    return [key,slot];
  }
  function linked(context:Context,id:number):unknown {
    const link=linksOf(context.graph).find(l=>l.id===id);
    if(!link) throw new Error(`워크플로 연결이 없습니다: ${id}`);
    return output(context,link.origin_id,link.origin_slot);
  }
  function build(context:Context,node:UiNode) {
    const key=context.prefix+node.id;
    if(graph[key]) return;
    if(building.has(key)) throw new Error('순환 워크플로는 지원하지 않습니다.');
    building.add(key);
    if(node.mode===2 || node.mode===4) throw new Error('비활성 노드가 연결된 워크플로는 지원하지 않습니다.');
    const inputs=widgetInputs(node,nodeInfo[node.type]);
    for(const port of node.inputs || []) {
      if(port.link!=null) {
        const value=linked(context,port.link);
        if(value!==undefined) inputs[port.name]=value;
      }
    }
    if(['EmptySD3LatentImage','EmptyLatentImage'].includes(node.type)) Object.assign(inputs,{width:size!.width,height:size!.height,batch_size:1});
    const promptNode = preset.id==='z-image'?27:preset.id==='qwen-2512'?227:19;
    if(node.id===promptNode && context.parent) inputs[preset.id==='krea-2'?'value':'text']=input.prompt;
    if(node.type==='KSampler' && controls.has(String(node.widgets_values?.[1])) && node.widgets_values?.[1]==='randomize') inputs.seed=randomInt(0,2**48-1);
    if(node.type==='SaveImage') inputs.filename_prefix='ComfyStudio/'+preset.id;
    graph[key]={class_type:node.type,inputs};
    building.delete(key);
  }
  const outputs=workflow.nodes.filter(n=>n.type==='SaveImage');
  if(!outputs.length) throw new Error('이미지 저장 노드가 없습니다.');
  for(const node of outputs) build(root,node);
  const result:ApiGraph={};
  function visit(key:string) {
    if(result[key]) return;
    const node=graph[key];
    if(!node || !nodeInfo[node.class_type]) throw new Error(`필요한 노드가 없습니다: ${node?.class_type || key}`);
    result[key]=node;
    for(const value of Object.values(node.inputs)) if(isRef(value)) visit(value[0]);
  }
  for(const node of outputs) visit(String(node.id));
  return result;
}
