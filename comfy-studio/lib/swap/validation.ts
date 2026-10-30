import type {SwapInput,SwapTarget} from './types.ts';
export const SWAP_MIN_SECONDS=5,SWAP_MAX_SECONDS=15;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// H3 windows sit on a 17n+5 frame grid at 24 fps; the nearest grid point is used: 5s is 124 frames, 10s 243, 15s 362.
export function swapFrames(seconds:number):number{if(!Number.isFinite(seconds)||seconds<SWAP_MIN_SECONDS||seconds>SWAP_MAX_SECONDS)throw new Error(`길이는 ${SWAP_MIN_SECONDS}~${SWAP_MAX_SECONDS}초로 선택해 주세요.`);return Math.round((seconds*24-5)/17)*17+5;}
// 32-pixel-aligned canvases near the 0.5MP budget used by the 480 workflow.
export function swapCanvas(width:number,height:number):{width:number;height:number}{const ratio=width/height;return ratio>=1.3?{width:864,height:480}:ratio<=0.77?{width:480,height:864}:{width:672,height:672};}
export const isSwapId=(id:unknown):id is string=>typeof id==='string'&&UUID.test(id);
export function validateSwapInput(raw:unknown):SwapInput{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('입력을 확인해 주세요.');
 const d=raw as Record<string,unknown>;
 if(Object.keys(d).some(k=>!['sourceId','referenceId','description','durationSeconds','target','consent'].includes(k)))throw new Error('지원하지 않는 설정입니다.');
 if(d.consent!==true)throw new Error('영상과 인물 사용 권한을 확인해 주세요.');
 if(!isSwapId(d.sourceId))throw new Error('원본 영상을 먼저 올려 주세요.');
 if(!isSwapId(d.referenceId))throw new Error('바꿔 넣을 인물 사진을 먼저 올려 주세요.');
 if(typeof d.description!=='string'||!d.description.trim()||d.description.trim().length>2000)throw new Error('바꿔 넣을 인물을 1~2,000자로 묘사해 주세요.');
 swapFrames(d.durationSeconds as number);
 if(d.target!=='one'&&d.target!=='all')throw new Error('교체 대상을 선택해 주세요.');
 return {sourceId:d.sourceId,referenceId:d.referenceId,description:d.description.trim(),durationSeconds:d.durationSeconds as number,target:d.target as SwapTarget,consent:true};
}
