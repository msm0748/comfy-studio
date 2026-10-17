import { useEffect,useRef } from 'react';
import type { JobRecord } from '@/lib/types';
import { Icon } from './icon';

export function ImageLightbox({result,onClose}:{result:JobRecord;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
  return <dialog ref={ref} className="lightbox" aria-label="생성 이미지 미리보기" onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}><button className="lightbox-close icon-button" aria-label="미리보기 닫기" onClick={onClose}><Icon name="close" size={24}/></button><img src={`/api/generations/${result.id}/image?index=0`} alt={result.input.prompt}/></dialog>;
}
