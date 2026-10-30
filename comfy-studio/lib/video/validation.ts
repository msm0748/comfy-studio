import {getVideoPreset} from './presets.ts';
import type {VideoInput,VideoMode,VideoResolution} from './types.ts';
export function videoInputIssue(input:VideoInput):string|null{try{validateVideoInput(input);return null;}catch(error){return error instanceof Error?error.message:'영상 설정을 확인해 주세요.';}}
export function validateVideoInput(raw:unknown):VideoInput{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('영상 입력을 확인해 주세요.');
 const data=raw as Record<string,unknown>;
 if(Object.keys(data).some(k=>!['mode','prompt','resolution','durationSeconds','referenceId','upscale','model'].includes(k)))throw new Error('지원하지 않는 영상 설정입니다.');
 if(!['text','image'].includes(String(data.mode)))throw new Error('영상 생성 방식을 다시 선택해 주세요.');
 if(typeof data.prompt!=='string'||!data.prompt.trim()||data.prompt.trim().length>8000)throw new Error('프롬프트는 1~8,000자로 입력해 주세요.');
 const preset=getVideoPreset(data.resolution as VideoResolution);
 if(typeof data.durationSeconds!=='number'||!Number.isInteger(data.durationSeconds)||data.durationSeconds<5||data.durationSeconds>preset.maxSeconds)throw new Error(`이 해상도의 영상 길이는 5~${preset.maxSeconds}초 사이로 선택해 주세요.`);
 if(data.model!==undefined&&data.model!=='singularity')throw new Error('영상 모델을 다시 선택해 주세요.');
 if(data.upscale!==undefined&&data.upscale!=='fast')throw new Error('확대 방식을 다시 선택해 주세요.');
 const result:VideoInput={mode:data.mode as VideoMode,prompt:data.prompt.trim(),resolution:preset.id,durationSeconds:data.durationSeconds,model:'singularity'};
 if(data.upscale==='fast')result.upscale='fast';
 if(result.mode==='image'){
  if(typeof data.referenceId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.referenceId))throw new Error('참조 이미지를 먼저 선택해 주세요.');
  result.referenceId=data.referenceId;
 }else if(data.referenceId!==undefined)throw new Error('텍스트 영상에는 참조 이미지를 지정할 수 없습니다.');
 return result;
}
