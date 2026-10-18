import {requireAuth} from '@/lib/require-auth';import {apiError} from '@/lib/api';import {getVideoAvailability} from '@/lib/video/service';
export async function GET(){try{await requireAuth();return Response.json(await getVideoAvailability(),{headers:{'Cache-Control':'no-store'}});}catch(error){return apiError(error);}}
