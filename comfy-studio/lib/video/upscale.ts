import {ServiceError} from '../service-error.ts';
import {validateVideoInput} from './validation.ts';
import type {VideoInput,VideoJobRecord,VideoOutputRef,VideoResolution,VideoUpscale} from './types.ts';

/** Missing choice belongs to pre-option jobs, where high output always meant AI. */
export function recordVideoUpscale(job:Pick<VideoJobRecord,'input'>):VideoUpscale{return job.input.upscale??(job.input.resolution==='480p'?'fast':'ai');}
export function originalVideoRef(job:VideoJobRecord):VideoOutputRef|null{return job.originalOutput??(job.input.resolution==='480p'?job.sourceOutput??null:null);}
export function createEnhancementInput(source:VideoJobRecord,resolution:VideoResolution):VideoInput{
 if(source.input.model==='singularity')throw new ServiceError('Singularity V2 영상에는 AI 업스케일이 이미 포함돼 있어요.',409);
 if(source.state!=='completed'||!originalVideoRef(source))throw new ServiceError('완성된 원본 영상이 있어야 AI 보정을 적용할 수 있습니다.',409);
 if(recordVideoUpscale(source)==='ai')throw new ServiceError('이미 AI 보정이 적용된 영상입니다.',409);
 if(resolution!=='720p'&&resolution!=='1080p')throw new ServiceError('AI 보정 출력은 720p 또는 1080p로 선택해 주세요.',400);
 // AI refinement always runs on MiniMax H3, whichever model generated the source.
 const {model:_model,...input}=source.input;void _model;
 try{return validateVideoInput({...input,resolution,upscale:'ai',sourceJobId:source.id});}catch(error){throw new ServiceError(error instanceof Error?error.message:'AI 보정 설정을 확인해 주세요.',400);}
}
export function videoOutputDescription(input:VideoInput):string{
 if(input.model==='singularity')return input.resolution==='720p'?'2단계 생성 · AI 업스케일 포함':'720p 2단계 생성 후 Lanczos 확대';
 if(input.resolution==='480p')return '864 × 480 원본 · 별도 확대 없음';
 if((input.upscale??'fast')==='fast')return 'Lanczos 확대 · AI 보정 없음';
 return input.resolution==='720p'?'영상 AI 업스케일·보정':'720p AI 보정 후 Lanczos 확대';
}
