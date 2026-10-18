import {sameOrigin} from '../api.ts';import {ServiceError,assertJobId} from '../jobs.ts';import {readLimitedBody} from '../request-body.ts';import {validateVideoInput} from './validation.ts';import type {VideoInput} from './types.ts';
export async function handleVideoPost<T>(request:Request,deps:{authorize:()=>Promise<void>;submit:(input:VideoInput,id:string)=>Promise<T>}):Promise<T>{
 await deps.authorize();sameOrigin(request);const id=request.headers.get('Idempotency-Key');if(!id)throw new ServiceError('영상 작업 번호가 없습니다.',400);assertJobId(id);
 const bytes=await readLimitedBody(request,40000);let input:VideoInput;try{input=validateVideoInput(JSON.parse(new TextDecoder().decode(bytes)));}catch(e){throw new ServiceError(e instanceof Error?e.message:'영상 입력을 확인해 주세요.',400);}return deps.submit(input,id);
}
export async function handleVideoEnhancePost<T>(request:Request,sourceId:string,deps:{authorize:()=>Promise<void>;submit:(sourceId:string,resolution:'720p'|'1080p',id:string)=>Promise<T>}):Promise<T>{
 await deps.authorize();sameOrigin(request);assertJobId(sourceId);const id=request.headers.get('Idempotency-Key');if(!id)throw new ServiceError('영상 작업 번호가 없습니다.',400);assertJobId(id);
 const bytes=await readLimitedBody(request,2000);let data:Record<string,unknown>;
 try{data=JSON.parse(new TextDecoder().decode(bytes));if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>k!=='resolution')||!['720p','1080p'].includes(String(data.resolution)))throw Error('AI 보정 출력은 720p 또는 1080p로 선택해 주세요.');}catch(error){throw new ServiceError(error instanceof Error?error.message:'AI 보정 설정을 확인해 주세요.',400);}
 return deps.submit(sourceId,data.resolution as '720p'|'1080p',id);
}
