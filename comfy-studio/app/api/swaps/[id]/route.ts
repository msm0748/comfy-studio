import {requireAuth} from '@/lib/require-auth';import {apiError} from '@/lib/api';import {getSwapJob} from '@/lib/swap/service';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{await requireAuth();const {id}=await context.params;return Response.json(await getSwapJob(id),{headers:{'Cache-Control':'no-store'}});}catch(error){return apiError(error);}}
