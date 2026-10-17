import { requireAuth } from '@/lib/require-auth';
import { apiError } from '@/lib/api';
import { references } from '@/lib/reference-images';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  try{await requireAuth();const {id}=await context.params;return new Response(new Uint8Array(await references.image(id)),{headers:{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
  catch(error){return apiError(error);}
}
