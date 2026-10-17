import {requireAuth} from '@/lib/require-auth';import {apiError} from '@/lib/api';import {getVideoMedia} from '@/lib/video/service';
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{await requireAuth();const {id}=await context.params;return await getVideoMedia(id,request);}catch(error){return apiError(error);}}
export const HEAD=GET;
