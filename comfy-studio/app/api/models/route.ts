import { getModelOptions } from '@/lib/comfy-client';
import { apiError } from '@/lib/api';
export const runtime='nodejs';
export async function GET() {
  try{return Response.json(await getModelOptions(),{headers:{'Cache-Control':'no-store'}});}catch(error){return apiError(error);}
}
