import {SWAP_MAX_SECONDS,SWAP_MIN_SECONDS} from './validation.ts';
export type TrimRange={start:number;end:number};
const clamp=(value:number,low:number,high:number)=>Math.min(Math.max(value,low),high);
const snap=(value:number)=>Math.round(value*10)/10;
export function initialTrim(duration:number):TrimRange{return {start:0,end:snap(Math.min(duration,15))};}
/** Moves one edge or the whole range; the other edge follows when a drag would exceed the length limits. */
export function moveTrim(range:TrimRange,kind:'start'|'end'|'both',time:number,duration:number):TrimRange{
 const t=snap(time);
 if(kind==='both'){const length=range.end-range.start,start=snap(clamp(t,0,Math.max(0,duration-length)));return {start,end:snap(start+length)};}
 if(kind==='start'){const start=clamp(t,0,Math.max(0,duration-SWAP_MIN_SECONDS));return {start,end:snap(clamp(range.end,start+SWAP_MIN_SECONDS,start+SWAP_MAX_SECONDS))};}
 const end=clamp(t,Math.min(SWAP_MIN_SECONDS,duration),duration);return {start:snap(clamp(range.start,end-SWAP_MAX_SECONDS,end-SWAP_MIN_SECONDS)),end};
}
// Tenths only: subtracting snapped edges can land just outside the allowed length, e.g. 30.000000000000004.
export const trimLength=(range:TrimRange)=>Math.round((range.end-range.start)*10)/10;
export const formatTime=(seconds:number)=>`${Math.floor(seconds/60)}:${(seconds%60).toFixed(1).padStart(4,'0')}`;
