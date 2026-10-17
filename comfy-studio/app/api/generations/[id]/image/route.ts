import { getGenerationImage } from '@/lib/comfy-client';
import { apiError } from '@/lib/api';
import { requireAuth } from '@/lib/require-auth';
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
  try {
    await requireAuth();
    const {id}=await context.params;
    const index=new URL(request.url).searchParams.get('index') || '0';
    return await getGenerationImage(id,/^\d+$/.test(index)?Number(index):-1);
  }catch(error){return apiError(error);}
}
