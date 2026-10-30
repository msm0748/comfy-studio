'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {ReferenceRecord} from '@/lib/types';import type {SwapAvailability,SwapInput,SwapJob,SwapSource,SwapTarget} from '@/lib/swap/types';
import {SWAP_MAX_SECONDS,swapFrames} from '@/lib/swap/validation';import {formatTime,trimLength,type TrimRange} from '@/lib/swap/trim';
import {Icon} from '../icon';import {ImageLightbox} from '../image-lightbox';import {ReferenceInput} from '../reference-input';import {StudioFooter} from '../studio-footer';import {StudioNav} from '../studio-nav';import {cutVideo} from './cut-video';import {TrimModal} from './trim-modal';
const JOB_KEY='comfy-studio-swap-job';
const active=(job:SwapJob|null)=>!!job&&['submitting','queued','running'].includes(job.state);
async function json<T>(url:string,options:RequestInit={}):Promise<T>{const response=await fetch(url,{...options,cache:'no-store'});if(response.status===401)window.location.replace('/login');const data=await response.json();if(!response.ok)throw new Error(data.error??'요청을 처리하지 못했습니다.');return data;}
const isVideoFile=(file:File)=>file.type.startsWith('video/')||/\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(file.name);
const LABELS={submitting:'원본을 준비하고 있어요',queued:'처리 순서를 기다리고 있어요',running:'인물을 바꾸고 있어요',completed:'영상이 완성됐어요',failed:'영상을 완료하지 못했어요'};
export function SwapStudio(){
 const [availability,setAvailability]=useState<SwapAvailability|null>(null);
 const [file,setFile]=useState<File|null>(null),[range,setRange]=useState<TrimRange|null>(null),[progress,setProgress]=useState(''),[draft,setDraft]=useState<{file:File;range:TrimRange|null}|null>(null),[dropping,setDropping]=useState(false);const [reference,setReference]=useState<ReferenceRecord|null>(null);
 const [description,setDescription]=useState(''),[target,setTarget]=useState<SwapTarget>('all'),[consent,setConsent]=useState(false);
 const [referenceBusy,setReferenceBusy]=useState(false),[referenceError,setReferenceError]=useState(''),[error,setError]=useState('');
 const [job,setJob]=useState<SwapJob|null>(null),[submitting,setSubmitting]=useState(false),[elapsed,setElapsed]=useState(0),[expanded,setExpanded]=useState<{src:string;alt:string}|null>(null);
 const sourceInput=useRef<HTMLInputElement>(null),uploaded=useRef<{key:string;source:SwapSource}|null>(null);
 const busy=submitting||referenceBusy||active(job);
 const accept=useCallback((next:SwapJob)=>{setJob(next);setError(next.error??'');localStorage.setItem(JOB_KEY,next.id);},[]);
 useEffect(()=>{let cancelled=false;void(async()=>{
  try{const next=await json<SwapAvailability>('/api/swaps');if(!cancelled)setAvailability(next);}catch{if(!cancelled)setAvailability({connected:false,available:false,reason:'연결을 확인해 주세요.'});}
  const previous=localStorage.getItem(JOB_KEY);if(previous)try{const restored=await json<SwapJob>('/api/swaps/'+encodeURIComponent(previous));if(!cancelled)accept(restored);}catch{}
 })();return()=>{cancelled=true;};},[accept]);
 useEffect(()=>{if(!job||!active(job))return;let cancelled=false;const id=job.id;const timer=setInterval(()=>void json<SwapJob>('/api/swaps/'+encodeURIComponent(id)).then(next=>{if(!cancelled)accept(next);}).catch(()=>{if(!cancelled)setError('연결을 확인하고 있습니다. 같은 작업을 이어서 확인합니다.');}),4000);return()=>{cancelled=true;clearInterval(timer);};},[job,accept]);
 useEffect(()=>{if(!job||!active(job))return;const timer=setInterval(()=>setElapsed(Math.max(0,Math.floor((Date.now()-Date.parse(job.createdAt))/1000))),1000);return()=>clearInterval(timer);},[job]);
 const length=range?trimLength(range):0;
 const canSubmit=!busy&&availability?.available===true&&!!file&&!!range&&!!reference&&!!description.trim()&&consent;
 const openEditor=useCallback((next:File)=>{setDraft({file:next,range:null});setError('');},[]);
 function applyDraft(){if(!draft?.range)return;if(draft.file!==file)uploaded.current=null;setFile(draft.file);setRange(draft.range);setDraft(null);}
 // The whole page accepts a dropped video, which opens the editor immediately. Nothing is uploaded until submit.
 useEffect(()=>{
  let depth=0;const hasFiles=(event:DragEvent)=>!!event.dataTransfer?.types.includes('Files');
  const enter=(event:DragEvent)=>{if(!hasFiles(event))return;event.preventDefault();depth++;setDropping(true);};
  const over=(event:DragEvent)=>{if(hasFiles(event))event.preventDefault();};
  const leave=(event:DragEvent)=>{if(!hasFiles(event))return;depth=Math.max(0,depth-1);if(!depth)setDropping(false);};
  const drop=(event:DragEvent)=>{if(!hasFiles(event))return;event.preventDefault();depth=0;setDropping(false);const next=event.dataTransfer?.files[0];if(!next)return;if(busy)setError('진행 중인 작업이 끝난 뒤 영상을 넣어 주세요.');else if(!isVideoFile(next))setError('영상 파일만 넣을 수 있어요. 사진은 참조 이미지 칸에서 선택해 주세요.');else openEditor(next);};
  window.addEventListener('dragenter',enter);window.addEventListener('dragover',over);window.addEventListener('dragleave',leave);window.addEventListener('drop',drop);
  return()=>{window.removeEventListener('dragenter',enter);window.removeEventListener('dragover',over);window.removeEventListener('dragleave',leave);window.removeEventListener('drop',drop);};
 },[busy,openEditor]);
 async function uploadReference(file:File){setReferenceBusy(true);setReferenceError('');try{const form=new FormData();form.set('image',file);const r=await json<{reference:ReferenceRecord}>('/api/references',{method:'POST',body:form});setReference(r.reference);}catch(e){setReferenceError(e instanceof Error?e.message:'이미지를 읽지 못했습니다.');}finally{setReferenceBusy(false);}}
 // Only the chosen range leaves the browser; the same range is not cut and uploaded twice.
 async function clip(current:File,chosen:TrimRange):Promise<SwapSource>{
  const key=`${chosen.start}-${chosen.end}`;if(uploaded.current?.key===key)return uploaded.current.source;
  setProgress('영상 자르는 중 0%');const cut=await cutVideo(current,chosen.start,chosen.end,ratio=>setProgress(`영상 자르는 중 ${Math.round(ratio*100)}%`));
  setProgress(`잘라낸 영상 올리는 중 (${(cut.size/1048576).toFixed(0)}MB)`);
  const {source}=await json<{source:SwapSource}>('/api/swaps/sources',{method:'POST',headers:{'Content-Type':'video/mp4'},body:cut});uploaded.current={key,source};return source;
 }
 async function submit(){if(!canSubmit||!file||!range||!reference)return;setSubmitting(true);setError('');setElapsed(0);try{const source=await clip(file,range);setProgress('작업을 접수하는 중');const input:SwapInput={sourceId:source.id,referenceId:reference.id,description:description.trim(),durationSeconds:length,target,consent:true};accept(await json<SwapJob>('/api/swaps',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(input)}));}catch(e){setError(e instanceof Error?e.message:'요청을 보내지 못했습니다.');}finally{setSubmitting(false);setProgress('');}}
 const done=job?.state==='completed'?job:null;const media=done?`/api/swaps/${done.id}/media`:null;
 return <><StudioNav connected={availability?.connected??null} active="swap"/><main className="studio-main"><div className="page-heading"><div><span className="eyebrow">YOUR PERSONAL CREATIVE SPACE</span><h1>영상 속 인물을, 새롭게<span>.</span></h1><p>영상 한 편과 사진 한 장으로 등장인물을 바꿔 보세요.</p></div><span className="workspace-badge">SWAP STUDIO <strong>04</strong></span></div><div className="workspace video-grid">
  <section className="settings-panel video-settings" aria-label="인물 교체 설정"><div className="panel-heading"><span>인물 교체 설정</span><small>SWAP THE CAST</small></div>
   <div className="video-model"><Icon name="video" size={20}/><div><strong>H3 Character Swap</strong><span>MiniMax H3 · 864×480 기준 · 소리 유지</span></div><span className="video-license">상업 이용 확인 필요</span></div>
   <div className="field-group reference-field"><div className="label-row"><span className="field-label">원본 영상</span><span className="field-optional">고른 구간 최대 {SWAP_MAX_SECONDS}초만 업로드</span></div>
    <input ref={sourceInput} type="file" accept="video/*" className="reference-file" tabIndex={-1} aria-label="원본 영상 파일" disabled={busy} onChange={e=>{const next=e.target.files?.[0];if(next)openEditor(next);e.target.value='';}}/>
    <button type="button" className="reference-upload" disabled={busy} onClick={()=>file&&range?setDraft({file,range}):sourceInput.current?.click()}><span className="reference-upload-icon"><Icon name="video" size={23}/></span><strong>{file&&range?`${formatTime(range.start)} ~ ${formatTime(range.end)} · ${length.toFixed(1)}초`:'영상을 끌어다 놓거나 선택하세요'}</strong><span>{file&&range?`${file.name} · 눌러서 구간 수정`:'바로 편집 창이 열려요'}</span></button>{file&&<button type="button" className="text-button" disabled={busy} onClick={()=>sourceInput.current?.click()}>다른 영상 선택</button>}</div>
   <ReferenceInput reference={reference} busy={busy} loading={referenceBusy} error={referenceError} onFile={file=>void uploadReference(file)} onRemove={()=>setReference(null)} onPreview={(src,alt)=>setExpanded({src,alt})} purpose="swap"/>
   <div className="field-group"><div className="label-row"><label className="field-label" htmlFor="swap-description">바꿔 넣을 인물 묘사</label><span className="field-optional">머리·옷을 구체적으로</span></div><textarea id="swap-description" className="video-prompt" value={description} maxLength={2000} disabled={busy} onChange={e=>setDescription(e.target.value)} placeholder="예: 올림머리에 갈색 니트 카디건을 입은 젊은 여성"/><p className="field-hint">묘사가 없으면 인물이 거의 바뀌지 않아요. 입력 내용은 Google 번역으로 전송됩니다.</p></div>
   <fieldset className="video-output"><legend>교체 대상</legend><div className="mode-switch" role="group" aria-label="교체 대상">{(['all','one'] as const).map(value=><button key={value} type="button" aria-pressed={target===value} disabled={busy} onClick={()=>setTarget(value)}>{value==='all'?'등장인물 전체':'가장 크게 나온 한 사람'}</button>)}</div><p className="field-hint">{target==='all'?'화면 전체를 다시 그려요. 컷이 많거나 여러 명일 때 맞지만 배경과 구도가 달라질 수 있어요.':'배경을 유지해요. 컷이 바뀌지 않는 한 사람 영상에 맞아요.'}</p></fieldset>
   {range&&<p className="field-hint">24fps · 실제 약 {(swapFrames(length)/24).toFixed(2)}초 · 예상 약 {Math.round(length*1.2)}분</p>}
   <label className="field-hint"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/> 영상과 사진을 쓸 권리가 있고, 실제 인물이 나오면 본인 동의를 받았습니다. 미성년자가 나오는 사진이나 영상은 쓰지 않습니다.</label>
   {availability?.reason&&<p className="reference-error" role="alert">{availability.reason}</p>}
   <button type="button" className="generate-button" disabled={!canSubmit} onClick={()=>void submit()}><Icon name={busy?'refresh':'sparkles'} size={18}/>{progress||(active(job)?'인물을 바꾸고 있어요':'인물 바꾸기')}</button>
  </section>
  <section className="results-panel video-results" aria-label="인물 교체 결과"><div className="canvas-toolbar"><span className="canvas-tab"><Icon name="video" size={16}/>영상 캔버스</span><span className="canvas-meta">{media?`${done!.width} × ${done!.height} · ${(done!.frames/24).toFixed(2)}s`:'YOUR NEW CAST'}</span></div><div className="video-canvas">
   {media?<video key={done!.id} controls playsInline preload="metadata" src={media} aria-label="인물을 바꾼 영상"/>:<div className="video-empty"><span className="eyebrow">SAME SCENE. NEW CAST.</span><Icon name="video" size={48}/><h2>새로운 주인공을<span>.</span></h2><p>영상과 사진을 올리고 인물을 묘사해 보세요.<br/>완성된 영상이 이곳에 나타납니다.</p></div>}
   {job&&active(job)&&<div className="generating-overlay" role="status"><span className="loading-orbit"><Icon name="sparkles" size={26}/></span><strong>{LABELS[job.state]}</strong><span>{Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,'0')} 경과</span><div className="indeterminate-bar"><span/></div><small>창을 닫아도 작업은 계속되고, 다시 열면 이어서 확인합니다.</small></div>}
  </div><div className="result-status" aria-live="polite">{error?<div className="error-notice"><span>{error}</span></div>:media?<><span className="ready-icon"><Icon name="check" size={13}/></span><span>영상 완성<span className="status-detail">H3 Character Swap · 원본 소리 유지</span></span><a className="download-button" href={media} download={`comfy-studio-swap-${done!.id}.mp4`}><Icon name="download" size={15}/>MP4 다운로드</a></>:<><Icon name="video" size={16}/><span>완성된 영상을 재생하고 다운로드하세요.</span><span className="status-small">MP4</span></>}</div></section>
 </div><StudioFooter/></main>{dropping&&!draft&&<div className="trim-drop" aria-hidden="true"><Icon name="video" size={40}/><strong>여기에 놓으면 바로 편집을 시작해요</strong><span>고른 구간만 올라가요 · 최대 {SWAP_MAX_SECONDS}초</span></div>}{draft&&<TrimModal file={draft.file} range={draft.range} onRange={next=>setDraft(current=>current&&{...current,range:next})} onApply={applyDraft} onCancel={()=>setDraft(null)} onError={message=>{setError(message);setDraft(null);}}/>}{expanded&&<ImageLightbox src={expanded.src} alt={expanded.alt} onClose={()=>setExpanded(null)}/>}</>;
}
