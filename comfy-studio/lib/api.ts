import { ServiceError } from './jobs.ts';
export function apiError(error:unknown) {
  console.error('[ComfyStudio API]',error);
  return Response.json({error:error instanceof ServiceError?error.message:'요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},{status:error instanceof ServiceError?error.status:500,headers:{'Cache-Control':'no-store'}});
}
export function sameOrigin(request:Request) {
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin)throw new ServiceError('다른 사이트에서 보낸 요청은 허용하지 않습니다.',403);
}
