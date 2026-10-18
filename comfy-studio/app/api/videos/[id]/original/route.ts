import {requireAuth} from '@/lib/require-auth';import {apiError} from '@/lib/api';import {getVideoOriginalMedia} from '@/lib/video/service';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{await requireAuth();const {id}=await context.params;const response=await getVideoOriginalMedia(id,request);response.headers.set('Content-Disposition',`inline; filename="comfy-studio-${id}-original.mp4"`);return response;}catch(error){return apiError(error);}}
export const HEAD=GET;
