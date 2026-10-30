import type {VideoOutputRef} from '../video/types.ts';
export type SwapTarget='one'|'all';
export type SwapInput={sourceId:string;referenceId:string;description:string;durationSeconds:number;target:SwapTarget;consent:true};
export type SwapSource={id:string;width:number;height:number;durationSeconds:number;hasAudio:boolean;createdAt:string};
export type SwapJob={id:string;promptId:string|null;input:SwapInput;createdAt:string;state:'submitting'|'queued'|'running'|'completed'|'failed';frames:number;width:number;height:number;output?:VideoOutputRef;error?:string};
export type SwapAvailability={connected:boolean;available:boolean;reason?:string};
