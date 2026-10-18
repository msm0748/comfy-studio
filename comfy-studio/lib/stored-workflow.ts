import type { ApiGraph, NodeInfo } from './types.ts';

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


function widgetInputs(node:UiNode, info:NodeInfo[string] | undefined,strictSchema=false):Record<string,unknown> {
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
  const saved=(node.inputs||[]).filter(p=>p.widget&&Object.hasOwn(result,p.name)).map(p=>p.name);
  const live=Object.keys(result).filter(name=>strictSchema||saved.includes(name));
  if(saved.length&&(saved.length!==live.length||saved.some((name,index)=>name!==live[index])))throw new Error(`저장된 워크플로 입력 스키마가 변경되었습니다: ${node.type}`);
  return result;
}

/** Traverses registered templates, resolves saved subgraphs and switches, and discards unreachable helpers. */
export type StoredPatch={key:string;nodeId:number;type:string;inputs:Record<string,unknown>;nested:boolean;widgets:unknown[]};
export function compileStoredGraph(raw:unknown,nodeInfo:NodeInfo,options:{outputTypes:string[];strictSchema?:boolean;patch:(context:StoredPatch)=>void}):ApiGraph {
  const workflow=structuredClone(raw) as Workflow;
  if(!workflow?.nodes?.length || !Array.isArray(workflow.links)) throw new Error('저장된 워크플로 형식을 확인해 주세요.');
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
    const inputs=widgetInputs(node,nodeInfo[node.type],options.strictSchema);
    for(const port of node.inputs || []) {
      if(port.link!=null) {
        const value=linked(context,port.link);
        if(value!==undefined) inputs[port.name]=value;
      }
    }
    options.patch({key,nodeId:node.id,type:node.type,inputs,nested:!!context.parent,widgets:node.widgets_values||[]});
    graph[key]={class_type:node.type,inputs};
    building.delete(key);
  }
  const outputs=workflow.nodes.filter(n=>options.outputTypes.includes(n.type));
  if(!outputs.length) throw new Error('저장 노드가 없습니다.');
  for(const node of outputs) build(root,node);
  const result:ApiGraph={};
  function visit(key:string) {
    if(result[key]) return;
    const node=graph[key];
    if(!node || !nodeInfo[node.class_type]) throw new Error(`필요한 노드가 없습니다: ${node?.class_type || key}`);
    const schema={...nodeInfo[node.class_type].input.required,...nodeInfo[node.class_type].input.optional};
    for(const [name,spec] of Object.entries(schema)){
      const value=node.inputs[name];if(value===undefined||isRef(value))continue;
      const [type,configRaw]=spec;const config=(configRaw||{}) as Record<string,unknown>;
      if((type==='INT'||type==='FLOAT')&&(typeof value!=='number'||!Number.isFinite(value)||(type==='INT'&&!Number.isInteger(value))||(typeof config.min==='number'&&value<config.min)||(typeof config.max==='number'&&value>config.max)))throw new Error(`워크플로 숫자 입력을 확인해 주세요: ${node.class_type}.${name}`);
      if((type==='BOOLEAN'&&typeof value!=='boolean')||(type==='STRING'&&typeof value!=='string'))throw new Error(`워크플로 입력 형식을 확인해 주세요: ${node.class_type}.${name}`);
    }
    result[key]=node;
    for(const value of Object.values(node.inputs)) if(isRef(value)) visit(value[0]);
  }
  for(const node of outputs) visit(String(node.id));
  return result;
}
