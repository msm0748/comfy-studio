import {requireAuth} from '@/lib/require-auth';import {apiError} from '@/lib/api';import {getVideoJob} from '@/lib/video/service';
export const runtime='nodejs';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{await requireAuth();const {id}=await context.params;return Response.json(await getVideoJob(id),{headers:{'Cache-Control':'no-store'}});}catch(error){return apiError(error);}}
