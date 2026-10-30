import {sameOrigin} from '../api.ts';import {ServiceError,assertJobId} from '../jobs.ts';import {readLimitedBody} from '../request-body.ts';import {validateVideoInput} from './validation.ts';import type {VideoInput} from './types.ts';
export async function handleVideoPost<T>(request:Request,deps:{authorize:()=>Promise<void>;submit:(input:VideoInput,id:string)=>Promise<T>}):Promise<T>{
 await deps.authorize();sameOrigin(request);const id=request.headers.get('Idempotency-Key');if(!id)throw new ServiceError('영상 작업 번호가 없습니다.',400);assertJobId(id);
 const bytes=await readLimitedBody(request,40000);let input:VideoInput;try{input=validateVideoInput(JSON.parse(new TextDecoder().decode(bytes)));}catch(e){throw new ServiceError(e instanceof Error?e.message:'영상 입력을 확인해 주세요.',400);}return deps.submit(input,id);
}
