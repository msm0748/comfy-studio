import type {VideoInput,VideoJobRecord,VideoOutputRef,VideoUpscale} from './types.ts';

/** Missing choice belongs to pre-option jobs, where high output always meant AI. */
export function recordVideoUpscale(job:Pick<VideoJobRecord,'input'>):VideoUpscale{return job.input.upscale??(job.input.resolution==='480p'?'fast':'ai');}
export function originalVideoRef(job:VideoJobRecord):VideoOutputRef|null{return job.originalOutput??(job.input.resolution==='480p'?job.sourceOutput??null:null);}
export function videoOutputDescription(input:VideoInput):string{
 if(input.model==='singularity')return input.resolution==='720p'?'2단계 생성 · AI 업스케일 포함':'720p 2단계 생성 후 Lanczos 확대';
 // Older jobs from models that are no longer offered.
 if(input.resolution==='480p')return '864 × 480 원본 · 별도 확대 없음';
 if((input.upscale??'fast')==='fast')return 'Lanczos 확대 · AI 보정 없음';
 return input.resolution==='720p'?'영상 AI 업스케일·보정':'720p AI 보정 후 Lanczos 확대';
}
