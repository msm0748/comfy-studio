import { getGeneration } from '@/lib/comfy-client';
import { apiError } from '@/lib/api';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  try {const {id}=await context.params;return Response.json(await getGeneration(id),{headers:{'Cache-Control':'no-store'}});}catch(error){return apiError(error);}
}
