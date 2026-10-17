import { useEffect,useRef } from 'react';
import { Icon } from './icon';

export function ImageLightbox({src,alt,onClose}:{src:string;alt:string;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
  return <dialog ref={ref} className="lightbox" aria-label="이미지 미리보기" onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}><button className="lightbox-close icon-button" aria-label="미리보기 닫기" onClick={onClose}><Icon name="close" size={24}/></button><img src={src} alt={alt}/></dialog>;
}
