import sharp, { type OutputInfo } from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir,readFile,writeFile,rename,unlink } from 'node:fs/promises';
import path from 'node:path';
import { assertJobId,ServiceError } from './jobs.ts';
import type { ReferenceRecord } from './types.ts';

export const MAX_IMAGE_BYTES=10*1024*1024;
export function createReferenceService(directory:string){
  const location=(id:string,extension:string)=>{assertJobId(id);return path.join(directory,id+extension);};
  async function get(id:string):Promise<ReferenceRecord>{
    try{return JSON.parse(await readFile(location(id,'.json'),'utf8')) as ReferenceRecord;}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new ServiceError('참조 이미지를 찾을 수 없습니다. 다시 선택해 주세요.',404);throw error;}
  }
  return {
    get,
    async image(id:string):Promise<Uint8Array>{await get(id);return readFile(location(id,'.png'));},
    async create(bytes:Uint8Array,sourceJobId?:string):Promise<ReferenceRecord>{
      if(sourceJobId)assertJobId(sourceJobId);
      if(bytes.length>MAX_IMAGE_BYTES)throw new ServiceError('이미지는 10MB 이하로 선택해 주세요.',413);
      let normalized:{data:Buffer;info:OutputInfo};
      try{
        const image=sharp(bytes,{limitInputPixels:25_000_000,failOn:'warning'});
        const meta=await image.metadata();
        if(!['png','jpeg','webp'].includes(meta.format??'')||(meta.pages??1)>1)throw new ServiceError('정지된 PNG, JPG, WebP 이미지만 사용할 수 있습니다.',400);
        if(!meta.width||!meta.height||meta.width*meta.height>25_000_000)throw new ServiceError('이미지 해상도는 2,500만 화소 이하로 선택해 주세요.',413);
        normalized=await image.rotate().resize({width:1536,height:1536,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
      }catch(error){if(error instanceof ServiceError)throw error;
        if(error instanceof Error&&/pixel limit/i.test(error.message))throw new ServiceError('이미지 해상도는 2,500만 화소 이하로 선택해 주세요.',413);
        throw new ServiceError('이미지 파일을 읽지 못했습니다. PNG, JPG, WebP 파일을 다시 선택해 주세요.',400);
      }
      const record:ReferenceRecord={id:randomUUID(),width:normalized.info.width,height:normalized.info.height,createdAt:new Date().toISOString(),...(sourceJobId?{sourceJobId}:{})};
      await mkdir(directory,{recursive:true});const imagePath=location(record.id,'.png');const metadataPath=location(record.id,'.json');
      try{
        await writeFile(imagePath+'.tmp',normalized.data,{flag:'wx'});await rename(imagePath+'.tmp',imagePath);
        await writeFile(metadataPath+'.tmp',JSON.stringify(record),{flag:'wx'});await rename(metadataPath+'.tmp',metadataPath);
      }catch(error){await Promise.allSettled([imagePath,imagePath+'.tmp',metadataPath,metadataPath+'.tmp'].map(file=>unlink(file)));throw error;}
      return record;
    },
  };
}
export const references=createReferenceService(path.join(process.cwd(),'.data','references'));
