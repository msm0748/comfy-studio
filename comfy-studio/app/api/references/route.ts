import { requireAuth } from '@/lib/require-auth';
import { sameOrigin,apiError } from '@/lib/api';
import { references } from '@/lib/reference-images';
import { getGenerationImage } from '@/lib/comfy-client';
import { handleReferencePost } from '@/lib/reference-api';
export async function POST(request:Request){
  try{await requireAuth();sameOrigin(request);const reference=await handleReferencePost(request,{references,getGenerationImage});return Response.json({reference},{status:201,headers:{'Cache-Control':'no-store'}});}
  catch(error){return apiError(error);}
}
