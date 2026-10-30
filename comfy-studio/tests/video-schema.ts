import {readFile} from 'node:fs/promises';
import {SINGULARITY_UNET} from '../lib/video/workflow.ts';import type {NodeInfo} from '../lib/types.ts';
// The captured fixture predates Singularity, so its model and its extra nodes are added here.
export async function videoSchema():Promise<NodeInfo>{
 const schema:NodeInfo=JSON.parse(await readFile(new URL('./fixtures/video/node-info.json',import.meta.url),'utf8'));
 (schema.UNETLoader.input.required!.unet_name[0] as string[]).push(SINGULARITY_UNET);
 (schema.LoraLoaderModelOnly.input.required!.lora_name[0] as string[]).push('minimax_h3_ref2v_lightx2v_turbo_4step_v0.1_resized_avg_rank_20_bf16.safetensors');
 schema.ModelAttentionBackend={input:{required:{model:['MODEL'],attention:[['pytorch attention','comfy kitchen attention']]}}} as never;
 schema.MiniMaxH3SigmaShift={input:{required:{model:['MODEL'],shift_video:['FLOAT'],shift_audio:['FLOAT']}}} as never;
 schema.ManualSigmas={input:{required:{sigmas:['STRING']}}} as never;
 return schema;
}
