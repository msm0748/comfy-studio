import { assertJobId,ServiceError } from './jobs.ts';
import { readLimitedBody } from './request-body.ts';
import { MAX_IMAGE_BYTES, type createReferenceService } from './reference-images.ts';
import type { ReferenceRecord } from './types.ts';

type Dependencies={references:Pick<ReturnType<typeof createReferenceService>,'create'>;getGenerationImage:(id:string,index:number)=>Promise<Response>};
export async function handleReferencePost(request:Request,deps:Dependencies):Promise<ReferenceRecord>{
  const type=request.headers.get('content-type')?.toLowerCase()??'';
  if(type.startsWith('multipart/form-data;')){
    const bytes=await readLimitedBody(request,MAX_IMAGE_BYTES+65536);
    let form:FormData;
    try{form=await new Response(new Uint8Array(bytes),{headers:{'Content-Type':request.headers.get('content-type')!}}).formData();}
    catch{throw new ServiceError('업로드 형식을 확인해 주세요.',400);}
    const values=[...form.entries()];
    if(values.length!==1||values[0][0]!=='image'||!(values[0][1] instanceof File))throw new ServiceError('참조 이미지는 한 장만 선택해 주세요.',400);
    const file=values[0][1];if(file.size>MAX_IMAGE_BYTES)throw new ServiceError('이미지는 10MB 이하로 선택해 주세요.',413);
    return deps.references.create(new Uint8Array(await file.arrayBuffer()));
  }
  if(type.split(';')[0]==='application/json'){
    const bytes=await readLimitedBody(request,4096);let body:Record<string,unknown>;
    try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ServiceError('참조 요청을 확인해 주세요.',400);}
    if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!['sourceJobId','index'].includes(k))||typeof body.sourceJobId!=='string'||(body.index!==undefined&&body.index!==0))throw new ServiceError('참조할 생성 결과를 확인해 주세요.',400);
    assertJobId(body.sourceJobId);
    const response=await deps.getGenerationImage(body.sourceJobId,0);
    if(!response.ok)throw new ServiceError('원본 결과를 읽지 못했습니다.',400);
    return deps.references.create(await readLimitedBody(response,MAX_IMAGE_BYTES),body.sourceJobId);
  }
  throw new ServiceError('지원하지 않는 업로드 형식입니다.',415);
}
