'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {VideoInput,VideoJobRecord,VideoAvailability} from '@/lib/video/types';import type {ReferenceRecord} from '@/lib/types';
import {createPendingVideo,submitOrRecoverVideo,videoCanSubmit,isActiveVideo,createVideoReferenceLoader} from '@/lib/video/submission';import {validateVideoInput} from '@/lib/video/validation';import {HttpError} from '@/lib/submission';
import {StudioNav} from '../studio-nav';import {ImageLightbox} from '../image-lightbox';import {VideoForm} from './video-form';import {VideoResult} from './video-result';
async function json<T>(url:string,options:RequestInit={}):Promise<T>{const response=await fetch(url,{...options,cache:'no-store',signal:options.signal??AbortSignal.timeout(25000)});if(response.status===401)window.location.replace('/login');const data=await response.json();if(!response.ok)throw new HttpError(data.error??'영상 요청을 처리하지 못했습니다.',response.status);return data;}
const read=(id:string)=>json<VideoJobRecord>('/api/videos/'+encodeURIComponent(id));
const send=(job:VideoJobRecord)=>json<VideoJobRecord>('/api/videos',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':job.id},body:JSON.stringify(job.input)});
const sourceReference=async(id:string)=>(await json<{reference:ReferenceRecord}>('/api/references',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceJobId:id,index:0})})).reference;
const loadReference=async(key:string)=>key.startsWith('source:')?sourceReference(key.slice(7)):(await json<{reference:ReferenceRecord}>('/api/references/'+encodeURIComponent(key.slice(10)))).reference;
export function VideoStudio(){
 const [input,setInput]=useState<VideoInput>({mode:'text',prompt:'',resolution:'720p',durationSeconds:7});
 const [availability,setAvailability]=useState<VideoAvailability|null>(null),[reference,setReference]=useState<ReferenceRecord|null>(null),[referenceBusy,setReferenceBusy]=useState(false),[referenceError,setReferenceError]=useState('');
 const [job,setJob]=useState<VideoJobRecord|null>(null),[result,setResult]=useState<VideoJobRecord|null>(null),[restoring,setRestoring]=useState(true),[submitting,setSubmitting]=useState(false),[error,setError]=useState(''),[elapsed,setElapsed]=useState(0),[expanded,setExpanded]=useState<{src:string;alt:string}|null>(null);
 const submission=useRef(false),referenceVersion=useRef(0),sourceLoader=useRef(createVideoReferenceLoader(loadReference));
 const busy=restoring||submitting||referenceBusy||isActiveVideo(job);
 const accept=useCallback((next:VideoJobRecord)=>{setJob(next);setError(next.error??'');localStorage.setItem('comfy-studio-video-job',next.id);if(isActiveVideo(next))localStorage.setItem('comfy-studio-video-pending',JSON.stringify(next));else localStorage.removeItem('comfy-studio-video-pending');if(next.state==='completed'){setResult(next);localStorage.setItem('comfy-studio-video-result',next.id);}},[]);
 const refresh=useCallback(async()=>{try{setAvailability(await json<VideoAvailability>('/api/videos/models'));}catch{setAvailability({connected:false,modes:[]});}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void refresh(),0);return()=>clearTimeout(timer);},[refresh]);
 useEffect(()=>{
  let cancelled=false;const loader=sourceLoader.current;
  void(async()=>{
   try{
    const sourceId=new URLSearchParams(window.location.search).get('sourceJobId');
    const previous=localStorage.getItem('comfy-studio-video-result');if(previous){try{const prior=await read(previous);if(!cancelled&&prior.state==='completed')setResult(prior);}catch{}}
    const current=localStorage.getItem('comfy-studio-video-job');let restored:VideoJobRecord|null=null;
    if(current){try{restored=await read(current);}catch{const raw=localStorage.getItem('comfy-studio-video-pending');if(raw){const pending=JSON.parse(raw) as VideoJobRecord;validateVideoInput(pending.input);if(pending.id===current)restored=pending;}}}
    if(cancelled)return;
    if(restored){accept(restored);setInput(restored.input);if(restored.input.referenceId){try{const r=await loader.load('reference:'+restored.input.referenceId);if(r&&!cancelled)setReference(r);}catch{if(!cancelled)setReferenceError('참조 이미지를 다시 확인해 주세요.');}}}
    if(sourceId&&!isActiveVideo(restored)){
     setReferenceBusy(true);const r=await loader.load('source:'+sourceId);if(r&&!cancelled){setReference(r);setInput({mode:'image',prompt:'',resolution:'720p',durationSeconds:7,referenceId:r.id});window.history.replaceState(null,'','/video');}
    }
   }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'영상 작업을 복구하지 못했습니다.');}
   finally{if(!cancelled){setRestoring(false);setReferenceBusy(false);}}
  })();return()=>{cancelled=true;loader.invalidate();};
 },[accept]);
 useEffect(()=>{
  if(!job||!isActiveVideo(job))return;let cancelled=false;const id=job.id;
  const poll=async()=>{try{const next=await read(id);if(!cancelled)accept(next);}catch(e){if(!cancelled){if(e instanceof HttpError&&e.status===404&&Date.now()-Date.parse(job.createdAt)>90000)accept({...job,state:'failed',error:'영상 요청이 접수되지 않았습니다. 설정을 확인한 뒤 새로 생성해 주세요.'});else setError('연결을 확인하고 있습니다. 같은 영상 작업을 복구합니다.');}}};
  const timer=setInterval(()=>void poll(),4000);return()=>{cancelled=true;clearInterval(timer);};
 },[job,accept]);
 useEffect(()=>{if(!job||!isActiveVideo(job))return;const timer=setInterval(()=>setElapsed(Math.max(0,Math.floor((Date.now()-Date.parse(job.createdAt))/1000))),1000);return()=>clearInterval(timer);},[job]);
 const change=(next:VideoInput)=>{referenceVersion.current++;sourceLoader.current.invalidate();setReferenceError('');setInput(next);};
 async function upload(file:File){const version=++referenceVersion.current;sourceLoader.current.invalidate();setReferenceBusy(true);setReferenceError('');try{const form=new FormData();form.set('image',file);const r=await json<{reference:ReferenceRecord}>('/api/references',{method:'POST',body:form});if(version===referenceVersion.current){setReference(r.reference);setInput(current=>({...current,mode:'image',referenceId:r.reference.id}));}}catch(e){if(version===referenceVersion.current)setReferenceError(e instanceof Error?e.message:'이미지를 읽지 못했습니다.');}finally{if(version===referenceVersion.current)setReferenceBusy(false);}}
 async function submit(){if(submission.current||!videoCanSubmit(input,availability,busy))return;submission.current=true;setSubmitting(true);setError('');try{const pending=createPendingVideo(validateVideoInput(input));accept(pending);setElapsed(0);accept(await submitOrRecoverVideo(pending,send,read));}finally{submission.current=false;setSubmitting(false);}}
 const reconnect=()=>{void refresh();if(job)void (job.state==='failed'&&job.sourceOutput?json<VideoJobRecord>('/api/videos/'+job.id+'/retry',{method:'POST'}):read(job.id)).then(accept).catch(()=>setError('아직 연결을 복구하지 못했습니다.'));const version=++referenceVersion.current;setReferenceBusy(true);void sourceLoader.current.retry().then(r=>{if(r&&version===referenceVersion.current){setReference(r);setReferenceError('');setError('');setInput(current=>({...current,mode:'image',referenceId:r.id}));window.history.replaceState(null,'','/video');}}).catch(()=>setReferenceError('참조 이미지를 아직 불러오지 못했습니다. 연결을 다시 확인해 주세요.')).finally(()=>{if(version===referenceVersion.current)setReferenceBusy(false);});};
 return <><StudioNav connected={availability?.connected??null} active="video"/><main className="studio-main"><div className="page-heading"><div><span className="eyebrow">YOUR PERSONAL CREATIVE SPACE</span><h1>상상을, 움직임으로<span>.</span></h1><p>한 줄의 이야기, 한 장의 사진에서 시작하세요.</p></div><span className="workspace-badge">VIDEO STUDIO <strong>02</strong></span></div><div className="workspace video-grid"><VideoForm input={input} onChange={change} availability={availability} reference={reference} busy={busy} loadingReference={referenceBusy} referenceError={referenceError} onReferenceRetry={reconnect} onFile={file=>void upload(file)} onRemove={()=>{referenceVersion.current++;sourceLoader.current.invalidate();setReference(null);setInput(current=>{const next={...current};delete next.referenceId;return next;});}} onPreview={(src,alt)=>setExpanded({src,alt})} canSubmit={videoCanSubmit(input,availability,busy)} onSubmit={()=>void submit()}/><VideoResult job={job} result={result} busy={isActiveVideo(job)||submitting} elapsed={elapsed} error={error} onReconnect={reconnect}/></div></main><footer className="studio-footer"><span>LESS SETUP. MORE IMAGINATION.</span><span>나만의 크리에이티브 스튜디오 ✦</span></footer>{expanded&&<ImageLightbox src={expanded.src} alt={expanded.alt} onClose={()=>setExpanded(null)}/>}</>;
}
