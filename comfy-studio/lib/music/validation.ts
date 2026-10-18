import type {MusicInput} from './types.ts';
export const MUSIC_MIN_SECONDS=15,MUSIC_MAX_SECONDS=120;
export function validateMusicInput(raw:unknown):MusicInput{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('노래 입력을 확인해 주세요.');const d=raw as Record<string,unknown>;
 if(Object.keys(d).some(k=>!['mode','prompt','lyrics','language','durationSeconds','durationMode','vocalGender'].includes(k)))throw Error('지원하지 않는 노래 설정입니다.');
 if(d.mode!=='vocal'&&d.mode!=='instrumental')throw Error('노래 생성 방식을 선택해 주세요.');
 if(typeof d.prompt!=='string'||!d.prompt.trim()||d.prompt.trim().length>4000)throw Error('분위기 설명은 1~4,000자로 입력해 주세요.');
 if(typeof d.lyrics!=='string'||d.lyrics.length>12000||(d.mode==='vocal'&&!d.lyrics.trim())||(d.mode==='instrumental'&&d.lyrics!==''))throw Error(d.mode==='instrumental'?'연주곡에는 가사를 지정할 수 없습니다.':'가사를 1~12,000자로 입력해 주세요.');
 if(!['ko','en','ja'].includes(String(d.language)))throw Error('노래 언어를 선택해 주세요.');
 if(d.durationMode==='auto'){
  if(d.durationSeconds!==undefined||!['auto','female','male'].includes(String(d.vocalGender))||(d.mode==='instrumental'&&d.vocalGender!=='auto'))throw Error('자동 길이와 보컬 성별 설정을 확인해 주세요.');
  return {mode:d.mode,prompt:d.prompt.trim(),lyrics:d.lyrics,language:d.language as MusicInput['language'],durationMode:'auto',vocalGender:d.vocalGender as MusicInput['vocalGender']};
 }
 if(d.durationMode!==undefined||d.vocalGender!==undefined)throw Error('노래 생성 설정을 확인해 주세요.');
 if(typeof d.durationSeconds!=='number'||!Number.isInteger(d.durationSeconds)||d.durationSeconds<MUSIC_MIN_SECONDS||d.durationSeconds>MUSIC_MAX_SECONDS)throw Error(`노래 길이는 ${MUSIC_MIN_SECONDS}~${MUSIC_MAX_SECONDS}초 사이로 선택해 주세요.`);
 return {mode:d.mode,prompt:d.prompt.trim(),lyrics:d.lyrics,language:d.language as MusicInput['language'],durationSeconds:d.durationSeconds};
}
