import { getModelOptions } from '@/lib/comfy-client';
import { apiError } from '@/lib/api';
import { connection } from 'next/server';
export async function GET() {
  await connection();
  try{return Response.json(await getModelOptions(),{headers:{'Cache-Control':'no-store'}});}catch(error){return apiError(error);}
}
