import { ServiceError } from './jobs.ts';

export async function readLimitedBody(request:Request,maxBytes:number):Promise<Uint8Array> {
  const length=request.headers.get('content-length');
  if(length && (!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))))throw new ServiceError('요청 크기를 확인해 주세요.',400);
  if(length && Number(length)>maxBytes)throw new ServiceError('이미지 용량이 너무 큽니다. 10MB 이하로 선택해 주세요.',413);
  if(!request.body)return new Uint8Array();
  const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
      if(size>maxBytes){await reader.cancel();throw new ServiceError('이미지 용량이 너무 큽니다. 10MB 이하로 선택해 주세요.',413);}chunks.push(value);}
  }finally{reader.releaseLock();}
  const output=new Uint8Array(size);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return output;
}
