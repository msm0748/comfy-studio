import {requireAuth} from '@/lib/require-auth';import {apiError} from '@/lib/api';import {ServiceError} from '@/lib/jobs';import {getMusicMedia} from '@/lib/music/service';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{await requireAuth();const format=new URL(request.url).searchParams.get('format')??'mp3';if(format!=='mp3'&&format!=='flac')throw new ServiceError('음악 파일 형식을 선택해 주세요.',400);const {id}=await context.params;return await getMusicMedia(id,format,request);}catch(error){return apiError(error);}}
export const HEAD=GET;
