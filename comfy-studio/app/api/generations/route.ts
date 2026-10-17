import { submitGeneration } from '@/lib/comfy-client';
import { validateGenerationInput } from '@/lib/validation';
import { apiError, sameOrigin } from '@/lib/api';
import { ServiceError } from '@/lib/jobs';
import { requireAuth } from '@/lib/require-auth';
export async function POST(request:Request) {
  try {
    await requireAuth();
    sameOrigin(request);
    const raw=await request.text();
    if(raw.length>40000)throw new ServiceError('입력 내용이 너무 깁니다.',400);
    let input;
    try{input=validateGenerationInput(JSON.parse(raw));}catch(error){throw new ServiceError(error instanceof Error?error.message:'입력을 확인해 주세요.',400);}
    const id=request.headers.get('Idempotency-Key');
    if(!id)throw new ServiceError('작업 번호가 없습니다. 다시 시도해 주세요.',400);
    return Response.json(await submitGeneration(input,id),{status:202,headers:{'Cache-Control':'no-store'}});
  }catch(error){return apiError(error);}
}
