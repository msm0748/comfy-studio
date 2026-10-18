import {requireAuth} from '@/lib/require-auth';import {apiError} from '@/lib/api';import {getMusicAvailability} from '@/lib/music/service';
export async function GET(){try{await requireAuth();return Response.json(await getMusicAvailability(),{headers:{'Cache-Control':'no-store'}});}catch(error){return apiError(error);}}
