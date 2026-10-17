import { requireAuth } from '@/lib/require-auth';
import { apiError } from '@/lib/api';
import { references } from '@/lib/reference-images';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  try{await requireAuth();const {id}=await context.params;return Response.json({reference:await references.get(id)},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return apiError(error);}
}
