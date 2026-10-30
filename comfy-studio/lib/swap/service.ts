import path from 'node:path';
import {translatePrompt} from '../translate-prompt.ts';import {references} from '../reference-images.ts';import {ServiceError} from '../jobs.ts';import {createVideoMediaService} from '../video/media.ts';import type {VideoJobRecord} from '../video/types.ts';
import {createSwapClient} from './client.ts';import {createSwapJobs} from './jobs.ts';import {createSwapSources} from './source.ts';import {compileSwapWorkflow,loadSwapWorkflow} from './workflow.ts';import type {SwapAvailability,SwapInput} from './types.ts';
export const swapSources=createSwapSources();
const client=createSwapClient({fetch:(...args)=>fetch(...args),translate:translatePrompt,readWorkflow:loadSwapWorkflow,reference:id=>references.image(id),sources:swapSources,base:process.env.COMFYUI_URL});
const jobs=createSwapJobs({directory:path.join(process.cwd(),'.data','swap-jobs'),source:swapSources.read,submit:client.submit,inspect:client.inspect,recover:client.recover});
const media=createVideoMediaService();
export async function getSwapAvailability():Promise<SwapAvailability>{
 let connected=false;
 try{await client.connected();connected=true;const info=await client.schema(),raw=await loadSwapWorkflow();for(const target of ['one','all'] as const)compileSwapWorkflow(raw,{target,description:'availability check',sourceFile:'a.mp4',referenceFile:'a.png',width:864,height:480,frames:124},info);return {connected:true,available:true};}
 catch(e){return {connected,available:false,reason:connected?(e instanceof Error?e.message:'인물 교체 구성을 확인해 주세요.'):'ComfyUI 연결을 확인해 주세요.'};}
}
export const submitSwap=(input:SwapInput,id:string)=>jobs.submit(input,id);
export const getSwapJob=jobs.get;
export async function getSwapMedia(id:string,request:Request){const job=await jobs.read(id);if(job.state!=='completed'||!job.output)throw new ServiceError('완성된 영상을 찾을 수 없습니다.',404);return media.serve({id,state:'completed',media:{kind:'comfy',ref:job.output}} as VideoJobRecord,request);}
