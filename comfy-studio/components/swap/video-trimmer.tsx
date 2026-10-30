'use client';
import {useEffect,useRef,useState,type KeyboardEvent,type PointerEvent} from 'react';
import {formatTime,initialTrim,moveTrim,trimLength,type TrimRange} from '@/lib/swap/trim';
import {SWAP_MAX_SECONDS,SWAP_MIN_SECONDS} from '@/lib/swap/validation';
const THUMBNAILS=12;
type Drag={kind:'start'|'end'|'both';offset:number};
export function VideoTrimmer({file,range,disabled,onChange,onError}:{file:File;range:TrimRange|null;disabled:boolean;onChange:(range:TrimRange)=>void;onError:(message:string)=>void}){
 const [url,setUrl]=useState(''),[duration,setDuration]=useState(0),[time,setTime]=useState(0),[playing,setPlaying]=useState(false);
 const video=useRef<HTMLVideoElement>(null),track=useRef<HTMLDivElement>(null),strip=useRef<HTMLCanvasElement>(null),drag=useRef<Drag|null>(null);
 useEffect(()=>{const next=URL.createObjectURL(file);const timer=setTimeout(()=>setUrl(next),0);return()=>{clearTimeout(timer);URL.revokeObjectURL(next);};},[file]);
 // Thumbnails come from a second, hidden element so preview playback is never interrupted.
 useEffect(()=>{
  if(!url||!duration)return;let cancelled=false;const probe=document.createElement('video');probe.muted=true;probe.preload='auto';probe.src=url;
  void(async()=>{
   await new Promise(resolve=>{probe.onloadeddata=resolve;probe.onerror=resolve;});
   const canvas=strip.current;const context=canvas?.getContext('2d');if(!canvas||!context||!probe.videoWidth)return;
   const height=120,width=Math.round(height*probe.videoWidth/probe.videoHeight);canvas.width=width*THUMBNAILS;canvas.height=height;
   for(let i=0;i<THUMBNAILS&&!cancelled;i++){await new Promise(resolve=>{probe.onseeked=resolve;probe.currentTime=duration*(i+0.5)/THUMBNAILS;});if(!cancelled)context.drawImage(probe,i*width,0,width,height);}
  })();
  return()=>{cancelled=true;probe.removeAttribute('src');probe.load();};
 },[url,duration]);
 useEffect(()=>{if(!playing)return;let frame=0;const tick=()=>{const v=video.current;if(v&&range){if(v.currentTime>=range.end)v.currentTime=range.start;setTime(v.currentTime);}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[playing,range]);
 const seek=(value:number)=>{if(video.current)video.current.currentTime=value;setTime(value);};
 const apply=(kind:Drag['kind'],value:number)=>{if(!range)return;const next=moveTrim(range,kind,value,duration);onChange(next);seek(kind==='end'?next.end:next.start);};
 const at=(event:PointerEvent)=>{const box=track.current!.getBoundingClientRect();return (event.clientX-box.left)/box.width*duration;};
 const begin=(event:PointerEvent,kind:Drag['kind'])=>{if(disabled||!range)return;event.stopPropagation();event.preventDefault();track.current!.setPointerCapture(event.pointerId);video.current?.pause();drag.current={kind,offset:kind==='both'?at(event)-range.start:0};};
 const move=(event:PointerEvent)=>{if(drag.current)apply(drag.current.kind,at(event)-drag.current.offset);};
 const end=(event:PointerEvent)=>{if(drag.current&&track.current!.hasPointerCapture(event.pointerId))track.current!.releasePointerCapture(event.pointerId);drag.current=null;};
 const key=(event:KeyboardEvent,kind:'start'|'end')=>{if(!range||disabled)return;const step=event.shiftKey?1:0.1,delta=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0;if(!delta)return;event.preventDefault();apply(kind,range[kind]+delta);};
 const toggle=()=>{const v=video.current;if(!v||!range)return;if(v.paused){if(v.currentTime<range.start||v.currentTime>=range.end)v.currentTime=range.start;void v.play();}else v.pause();};
 const percent=(value:number)=>duration?`${value/duration*100}%`:'0%';
 const ready=!!range&&duration>0;
 return <><div className="video-canvas"><video ref={video} src={url||undefined} playsInline preload="metadata" aria-label="자를 원본 영상" onClick={toggle} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onError={()=>{if(url)onError('이 브라우저에서 재생할 수 없는 영상 형식입니다. MP4(H.264)로 올려 주세요.');}} onLoadedMetadata={event=>{const d=event.currentTarget.duration;if(!Number.isFinite(d)||d<SWAP_MIN_SECONDS){onError(`원본 영상은 ${SWAP_MIN_SECONDS}초 이상이어야 합니다.`);return;}setDuration(d);onChange(initialTrim(d));}}/></div>
  {ready&&<div className="trimmer" data-testid="trimmer"><div className="trimmer-controls"><button type="button" onClick={toggle}>{playing?'일시정지':'재생'}</button><span>{formatTime(range.start)} ~ {formatTime(range.end)}</span><span className="trimmer-length">{trimLength(range).toFixed(1)}초 / 최대 {SWAP_MAX_SECONDS}초</span></div>
   <div ref={track} className="trimmer-track" onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerDown={event=>{if(!disabled&&range){const t=at(event);seek(Math.min(Math.max(t,range.start),range.end));}}}><canvas ref={strip} aria-hidden="true"/><div className="trimmer-shade" style={{left:0,width:percent(range.start)}}/><div className="trimmer-shade" style={{left:percent(range.end),right:0}}/>
    <div className="trimmer-range" style={{left:percent(range.start),width:percent(range.end-range.start)}} onPointerDown={event=>begin(event,'both')}><button type="button" className="trimmer-handle start" role="slider" aria-label="구간 시작" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(range.start*10)/10} disabled={disabled} onPointerDown={event=>begin(event,'start')} onKeyDown={event=>key(event,'start')}/><button type="button" className="trimmer-handle end" role="slider" aria-label="구간 끝" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(range.end*10)/10} disabled={disabled} onPointerDown={event=>begin(event,'end')} onKeyDown={event=>key(event,'end')}/></div>
    <div className="trimmer-playhead" style={{left:percent(time)}}/></div>
   <div className="trimmer-times"><span>0:00.0</span><span>손잡이를 끌어 구간을 고르세요 · 고른 부분만 올라가요</span><span>{formatTime(duration)}</span></div></div>}</>;
}
