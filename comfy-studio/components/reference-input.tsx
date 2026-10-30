'use client';
import { useRef } from 'react';
import type { ReferenceRecord } from '@/lib/types';
import { Icon } from './icon';
export function ReferenceInput({reference,busy,loading,error,onFile,onRemove,onPreview,purpose='edit'}:{reference:ReferenceRecord|null;busy:boolean;loading:boolean;error:string;onFile:(file:File)=>void;onRemove:()=>void;onPreview:(src:string,alt:string)=>void;purpose?:'edit'|'video'|'swap'}){
  const input=useRef<HTMLInputElement>(null);
  return <div className="field-group reference-field"><div className="label-row"><span className="field-label">참조 이미지</span><span className="field-optional">{purpose==='swap'?'얼굴과 옷이 잘 보이는 사진':'한 장에서 시작하는 새로운 장면'}</span></div>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="reference-file" tabIndex={-1} aria-label="참조 이미지 파일" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)onFile(file);e.target.value='';}}/>
    {reference?<div className="reference-card"><button className="reference-preview" type="button" disabled={busy} onClick={()=>onPreview(`/api/references/${reference.id}/image`,purpose==='video'?'영상 참조 이미지':'편집 참조 이미지')} aria-label="참조 이미지 크게 보기"><img src={`/api/references/${reference.id}/image`} alt={purpose==='video'?'영상 참조 이미지':'편집 참조 이미지'}/><span><Icon name="expand" size={14}/></span></button><div className="reference-info"><span className="reference-eyebrow">YOUR REFERENCE</span><strong>{purpose==='swap'?'바꿔 넣을 인물':purpose==='video'?'영상의 시작 이미지':'이 이미지로 이어 만들기'}</strong><span>{reference.width} × {reference.height} · 참조 준비 완료</span><div><button type="button" disabled={busy} onClick={()=>input.current?.click()}>교체</button><button type="button" disabled={busy} onClick={onRemove}>제거</button></div></div></div>
      :<button type="button" className="reference-upload" disabled={busy} onClick={()=>input.current?.click()}><span className="reference-upload-icon"><Icon name={busy?'refresh':'image'} className={busy?'spin':''} size={23}/></span><strong>{busy?'참조 이미지를 준비하고 있어요':purpose==='swap'?'바꿔 넣을 인물 사진을 선택하세요':purpose==='video'?'영상으로 만들 이미지를 선택하세요':'편집할 이미지를 선택하세요'}</strong><span>PNG · JPG · WebP / 최대 10MB</span></button>}
    {loading&&reference&&<p className="field-hint" role="status">참조 이미지를 준비하고 있어요…</p>}{error&&<p className="reference-error" role="alert">{error}</p>}
  </div>;
}
