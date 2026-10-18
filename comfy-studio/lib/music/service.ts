import {readFile} from 'node:fs/promises';import path from 'node:path';import {translatePrompt} from '../translate-prompt.ts';import {ServiceError} from '../jobs.ts';import {createMusicClient} from './client.ts';import {createMusicJobs} from './jobs.ts';import {createMusicMedia} from './media.ts';import {loadMusicWorkflow,compileMusicWorkflow} from './workflow.ts';import {MUSIC_MAX_SECONDS} from './validation.ts';import type {MusicAvailability,MusicInput,MusicFormat} from './types.ts';
const client=createMusicClient({fetch:(...args)=>fetch(...args),translate:translatePrompt,readWorkflow:loadMusicWorkflow,base:process.env.COMFYUI_URL});const jobs=createMusicJobs({directory:path.join(process.cwd(),'.data','music-jobs'),submit:client.submit,inspect:client.inspect,recover:client.recover});const media=createMusicMedia();
export async function getMusicAvailability():Promise<MusicAvailability>{
 const maxSeconds=MUSIC_MAX_SECONDS;let verified=false;
 try{const saved=JSON.parse(await readFile(path.join(process.cwd(),'.data','music-capabilities.json'),'utf8')),cert=saved.autoEnding;verified=cert?.verified===true&&cert.version===1&&cert.maxSeconds===maxSeconds&&['vocal','instrumental'].every(mode=>cert.modes?.includes(mode))&&['auto','female','male'].every(voice=>cert.voices?.includes(voice));}catch{}
 let connected=false;try{await client.connected();connected=true;const info=await client.schema(),raw=await loadMusicWorkflow();for(const mode of ['vocal','instrumental'] as const)compileMusicWorkflow(raw,{mode,prompt:'Music availability check',lyrics:mode==='vocal'?'[Verse]\nA little light':'',language:'ko',durationMode:'auto',vocalGender:'auto'},info);if(!verified&&process.env.STUDIO_MUSIC_VALIDATION_MODE!=='1')throw Error('자동 끝맺음의 PC 실측 검증을 기다리고 있습니다.');return {connected:true,available:true,maxSeconds,verified,autoEnding:true};}catch(e){return {connected,available:false,maxSeconds,verified,autoEnding:false,reason:e instanceof Error?e.message:'음악 서버 연결을 확인해 주세요.'};}
}
export async function submitMusic(input:MusicInput,id:string){
 try{await jobs.read(id);return jobs.submit(input,id);}catch(e){if(!(e instanceof ServiceError)||e.status!==404)throw e;}
 if(input.durationMode!=='auto')throw new ServiceError('노래 길이가 자동으로 변경되었습니다. 화면을 새로고침한 뒤 생성해 주세요.',400);
 const availability=await getMusicAvailability();if(!availability.available)throw new ServiceError(availability.reason??'노래를 생성할 수 없습니다.');return jobs.submit(input,id);
}
export const getMusicJob=jobs.get;
export async function getMusicMedia(id:string,format:MusicFormat,request:Request){return media.serve(await jobs.read(id),format,request);}
