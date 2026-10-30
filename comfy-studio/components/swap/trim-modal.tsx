'use client';
import {useEffect,useRef} from 'react';
import type {TrimRange} from '@/lib/swap/trim';
import {Icon} from '../icon';import {VideoTrimmer} from './video-trimmer';
export function TrimModal({file,range,onRange,onApply,onCancel,onError}:{file:File;range:TrimRange|null;onRange:(range:TrimRange)=>void;onApply:()=>void;onCancel:()=>void;onError:(message:string)=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
 return <dialog ref={ref} className="trim-modal" aria-label="영상 구간 고르기" onCancel={onCancel}><div className="trim-modal-head"><div><strong>구간 고르기</strong><span>{file.name}</span></div><button type="button" className="icon-button" aria-label="구간 고르기 닫기" onClick={onCancel}><Icon name="close" size={20}/></button></div>
  <VideoTrimmer key={file.name+file.size+file.lastModified} file={file} range={range} disabled={false} onChange={onRange} onError={onError}/>
  <div className="trim-modal-actions"><button type="button" className="text-button" onClick={onCancel}>취소</button><button type="button" className="generate-button" disabled={!range} onClick={onApply}><Icon name="check" size={18}/>이 구간 사용</button></div></dialog>;
}
