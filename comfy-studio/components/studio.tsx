'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GenerationInput, JobRecord, ModelId, ModelOption, SizeId, ReferenceRecord,StudioMode } from '@/lib/types';
import { getPreset } from '@/lib/presets';
import { restoreEditorState } from '@/lib/editor-state';
import { validateGenerationInput } from '@/lib/validation';
import { HttpError, canGenerate, createPendingJob, disableModels, isActiveJob, restorePendingJob, submitOrRecover } from '@/lib/submission';
import { StudioNav } from './studio-nav';
import { StudioFooter } from './studio-footer';
import { GenerationForm } from './generation-form';
import { GenerationResult } from './generation-result';
import { ImageLightbox } from './image-lightbox';
import { Icon } from './icon';

async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    signal: options?.signal || AbortSignal.timeout(25000),
  });
  if (response.status === 401) window.location.replace('/login');
  const data = await response.json();
  if (!response.ok) throw new HttpError(data.error || '요청에 실패했습니다.', response.status);
  return data as T;
}
const readJob = (id: string) => json<JobRecord>('/api/generations/' + encodeURIComponent(id));
const sendJob = (pending: JobRecord) => json<JobRecord>('/api/generations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.id },
  body: JSON.stringify(pending.input),
});

export function Studio() {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [modelId, setModelId] = useState<ModelId>('z-image');
  const [sizeId, setSizeId] = useState<SizeId>('square');
  const [prompt, setPrompt] = useState('');
  const [editPrompt,setEditPrompt]=useState('');
  const [reference,setReference]=useState<ReferenceRecord|null>(null);
  const [referenceBusy,setReferenceBusy]=useState(false);
  const [referenceError,setReferenceError]=useState('');
  const [preserveIdentity,setPreserveIdentity]=useState(true);
  const [strength,setStrength]=useState<GenerationInput['strength']>('medium');
  const referenceRequest=useRef(0);
  const referenceController=useRef<AbortController|null>(null);
  const generationModel=useRef<ModelId>('z-image');
  const mode=getPreset(modelId).mode;
  const [job, setJob] = useState<JobRecord | null>(null);
  const [result, setResult] = useState<JobRecord | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState<{src:string;alt:string}|null>(null);
  const submitLock = useRef(false);
  const promptRef = useRef<HTMLDivElement>(null);
  const busy = submitting || restoring || referenceBusy || isActiveJob(job);

  const accept = useCallback((next: JobRecord) => {
    setJob(next);
    setError(next.error || '');
    localStorage.setItem('comfy-studio-job', next.id);
    if (isActiveJob(next)) localStorage.setItem('comfy-studio-pending', JSON.stringify(next));
    else localStorage.removeItem('comfy-studio-pending');
    if (next.state === 'completed') {
      setResult(previous => !previous || Date.parse(next.createdAt) >= Date.parse(previous.createdAt) ? next : previous);
      localStorage.setItem('comfy-studio-result', next.id);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await json<{ connected: boolean; models: ModelOption[] }>('/api/models');
      setModels(data.models);
      setConnected(data.connected);
    } catch {
      setConnected(false);
      setModels(disableModels);
    }
  }, []);

  const restoreForm=useCallback(async(input:GenerationInput,signal?:AbortSignal)=>{
    const state=await restoreEditorState(input,async id=>(await json<{reference:ReferenceRecord}>(`/api/references/${id}`,{signal})).reference);
    if(signal?.aborted)return;
    setStrength(state.input.strength??'medium');setModelId(state.input.modelId);setSizeId(state.input.sizeId);setPreserveIdentity(state.input.preserveIdentity!==false);
    if(getPreset(state.input.modelId).mode==='edit')setEditPrompt(state.input.prompt);else setPrompt(state.input.prompt);
    setReference(state.reference);setReferenceError(state.referenceError);
  },[]);

  useEffect(() => { const timer=setTimeout(()=>void refresh(),0);return()=>clearTimeout(timer); }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    queueMicrotask(()=>{
    if(cancelled)return;
    const previous = localStorage.getItem('comfy-studio-result');
    const current = localStorage.getItem('comfy-studio-job');
    if (previous) {
      void json<JobRecord>('/api/generations/' + encodeURIComponent(previous), { signal: controller.signal })
        .then(value => {
          if (!cancelled && value.state === 'completed') {
            setResult(old => !old || Date.parse(value.createdAt) > Date.parse(old.createdAt) ? value : old);
          }
        }).catch(() => {});
    }
    if (!current) { setRestoring(false); return; }
    let pending: JobRecord | null = null;
    try {
      const cached = JSON.parse(localStorage.getItem('comfy-studio-pending') || 'null') as JobRecord | null;
      if (cached?.id === current && isActiveJob(cached)) pending = {...cached,input:validateGenerationInput(cached.input)};
    } catch { /* A damaged local draft is recovered from the server instead. */ }
    if (pending) {
      setJob(pending);
      setModelId(pending.input.modelId);
      setSizeId(pending.input.sizeId);
      if(getPreset(pending.input.modelId).mode==='edit')setEditPrompt(pending.input.prompt);else setPrompt(pending.input.prompt);
      setPreserveIdentity(pending.input.preserveIdentity!==false);setStrength(pending.input.strength??'medium');
    }
    const lookup = (id: string) => json<JobRecord>('/api/generations/' + encodeURIComponent(id), { signal: controller.signal });
    const recovery = pending ? restorePendingJob(pending, lookup) : lookup(current);
    void recovery.then(async value => {
      if(cancelled)return;
      accept(value);
      await restoreForm(value.input,controller.signal);
      if (!cancelled) setRestoring(false);
    }).catch(cause => {
      if (cancelled) return;
      if (cause instanceof HttpError && cause.status === 404) {
        localStorage.removeItem('comfy-studio-job');
        setRestoring(false);
      }
      setError('이전 작업의 상태를 확인하지 못했습니다. 연결 확인 및 요청 복구를 눌러주세요.');
    });
    });
    return () => { cancelled = true; controller.abort(); };
  }, [accept,restoreForm]);

  useEffect(() => {
    if (!job || !isActiveJob(job)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const next = await json<JobRecord>('/api/generations/' + job!.id, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        });
        if (cancelled) return;
        accept(next);
        setConnected(true);
        if (isActiveJob(next)) timer = setTimeout(poll, 2000);
        else void refresh();
      } catch {
        if (!cancelled) {
          setConnected(false);
          setError('연결이 잠시 끊겼어요. 같은 작업의 상태를 다시 확인하고 있습니다.');
          timer = setTimeout(poll, 5000);
        }
      }
    }
    timer = setTimeout(poll, 2000);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [job?.id, isActiveJob(job), accept, refresh]);

  useEffect(() => {
    if (!busy || !job) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(job.createdAt)) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [busy, job?.id, job?.createdAt]);

  async function submit(input: GenerationInput) {
    const model = models.find(model => model.id === input.modelId);
    if (submitLock.current || !canGenerate(connected, model, busy, input.prompt)) return;
    submitLock.current = true;
    setSubmitting(true);
    setElapsed(0);
    const pending = createPendingJob(input);
    accept(pending); // Persist identity and lock the UI before the request can be accepted.
    try { accept(await submitOrRecover(pending, sendJob, readJob)); }
    finally { setSubmitting(false); submitLock.current = false; }
  }

  async function reconnect() {
    setRestoring(true);
    await refresh();
    const id = localStorage.getItem('comfy-studio-job');
    if (!id) { setRestoring(false); return; }
    try { const recovered=await readJob(id);accept(recovered);await restoreForm(recovered.input); }
    catch (cause) {
      // Explicit recovery reuses the same ID; it never starts a fresh copy of an ambiguous request.
      if (cause instanceof HttpError && cause.status === 404 && job?.state === 'submitting' && job.id === id) {
        const recovered=await submitOrRecover(job, sendJob, readJob);accept(recovered);await restoreForm(recovered.input);
      } else {
        setConnected(false);
        setError(cause instanceof Error ? cause.message : '상태를 확인하지 못했습니다.');
      }
    }finally{setRestoring(false);}
  }

  function chooseIdea(value: string) {
    if(mode==='edit')setEditPrompt(value);else setPrompt(value);
    promptRef.current?.querySelector('textarea')?.focus({ preventScroll: true });
    if (window.innerWidth < 800) promptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function changeMode(next:StudioMode){
    if(busy)return;
    if(mode==='generate')generationModel.current=modelId;
    setModelId(next==='edit'?'z-image-edit':generationModel.current);setSizeId('square');
  }
  async function prepareReference(source:File|JobRecord){
    if(busy)return;
    if(source instanceof File&&source.size>10*1024*1024){setReferenceError('이미지는 10MB 이하로 선택해 주세요.');return;}
    const requestId=++referenceRequest.current;referenceController.current?.abort();
    const controller=new AbortController();referenceController.current=controller;
    setReferenceBusy(true);setReferenceError('');
    if(!(source instanceof File)){
      if(mode==='generate')generationModel.current=modelId;
      setModelId(mode==='edit'?modelId:'z-image-edit');setEditPrompt('');setPreserveIdentity(true);
    }
    try{
      let body:BodyInit;let headers:HeadersInit|undefined;
      if(source instanceof File){const form=new FormData();form.set('image',source);body=form;}
      else{body=JSON.stringify({sourceJobId:source.id,index:0});headers={'Content-Type':'application/json'};}
      const data=await json<{reference:ReferenceRecord}>('/api/references',{method:'POST',body,headers,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)])});
      if(requestId!==referenceRequest.current)return;
      setReference(data.reference);if(mode==='generate')generationModel.current=modelId;
      setModelId(mode==='edit'?modelId:'z-image-edit');setSizeId('square');
      promptRef.current?.scrollIntoView({behavior:'smooth',block:'start'});
      requestAnimationFrame(()=>promptRef.current?.querySelector('textarea')?.focus({preventScroll:true}));
    }catch(cause){if(requestId===referenceRequest.current&&!controller.signal.aborted)setReferenceError(cause instanceof Error?cause.message:'참조 이미지를 준비하지 못했습니다.');}
    finally{if(requestId===referenceRequest.current)setReferenceBusy(false);}
  }
  function removeReference(){referenceRequest.current++;referenceController.current?.abort();setReference(null);setReferenceError('');setReferenceBusy(false);}

  return <>
    <StudioNav connected={connected} />
      <main className="studio-main">
        <div className="page-heading">
          <div><div className="heading-eyebrow"><span />YOUR PERSONAL CREATIVE SPACE</div>
            <h1>상상을, 이미지로<span>.</span></h1><p>당신의 아이디어에 딱 맞는 한 장을 만들어보세요.</p></div>
          <span className="workspace-badge"><Icon name="sparkles" size={15} />IMAGE STUDIO<span>01</span></span>
        </div>
        <div className="workspace">
          <div ref={promptRef}>
            <GenerationForm models={models} modelId={modelId} sizeId={sizeId} prompt={mode==='edit'?editPrompt:prompt} busy={busy}
              mode={mode} onMode={changeMode} reference={reference} referenceBusy={referenceBusy} referenceError={referenceError}
              strength={strength} onStrength={setStrength} onReference={file=>void prepareReference(file)} onRemoveReference={removeReference} preserveIdentity={preserveIdentity} onPreserveIdentity={setPreserveIdentity} onPreview={(src,alt)=>setExpanded({src,alt})}
              onReferenceRetry={reconnect} canRetryReference={!!job?.input.referenceId&&!reference}
              connected={connected} onModel={value => { setModelId(value); setSizeId('square'); }}
              onSize={setSizeId} onPrompt={mode==='edit'?setEditPrompt:setPrompt} onSubmit={submit} onRefresh={refresh} />
          </div>
          <GenerationResult key={result?.id??'empty'} job={job} result={result} elapsed={elapsed} error={error} onIdea={chooseIdea}
            onExpand={(src,alt) => setExpanded({src,alt})} onContinue={value=>void prepareReference(value)} mode={mode} onReconnect={reconnect} busy={busy} />
        </div>
        <StudioFooter />
      </main>
    {expanded && <ImageLightbox src={expanded.src} alt={expanded.alt} onClose={() => setExpanded(null)} />}
  </>;
}
