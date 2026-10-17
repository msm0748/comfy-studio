'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GenerationInput, JobRecord, ModelId, ModelOption, SizeId } from '@/lib/types';
import { HttpError, canGenerate, createPendingJob, disableModels, isActiveJob, restorePendingJob, submitOrRecover } from '@/lib/submission';
import { StudioNav } from './studio-nav';
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
  const [job, setJob] = useState<JobRecord | null>(null);
  const [result, setResult] = useState<JobRecord | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const submitLock = useRef(false);
  const promptRef = useRef<HTMLDivElement>(null);
  const busy = submitting || restoring || isActiveJob(job);

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

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
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
    if (!current) { setRestoring(false); return () => controller.abort(); }
    let pending: JobRecord | null = null;
    try {
      const cached = JSON.parse(localStorage.getItem('comfy-studio-pending') || 'null') as JobRecord | null;
      if (cached?.id === current && isActiveJob(cached)) pending = cached;
    } catch { /* A damaged local draft is recovered from the server instead. */ }
    if (pending) {
      setJob(pending);
      setModelId(pending.input.modelId);
      setSizeId(pending.input.sizeId);
      setPrompt(pending.input.prompt);
    }
    const lookup = (id: string) => json<JobRecord>('/api/generations/' + encodeURIComponent(id), { signal: controller.signal });
    const recovery = pending ? restorePendingJob(pending, lookup) : lookup(current);
    void recovery.then(value => {
      if (!cancelled) { accept(value); setRestoring(false); }
    }).catch(cause => {
      if (cancelled) return;
      if (cause instanceof HttpError && cause.status === 404) {
        localStorage.removeItem('comfy-studio-job');
        setRestoring(false);
      }
      setError('이전 작업의 상태를 확인하지 못했습니다. 연결 확인 및 요청 복구를 눌러주세요.');
    });
    return () => { cancelled = true; controller.abort(); };
  }, [accept]);

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
    await refresh();
    const id = localStorage.getItem('comfy-studio-job');
    if (!id) { setRestoring(false); return; }
    try { accept(await readJob(id)); setRestoring(false); }
    catch (cause) {
      // Explicit recovery reuses the same ID; it never starts a fresh copy of an ambiguous request.
      if (cause instanceof HttpError && cause.status === 404 && job?.state === 'submitting' && job.id === id) {
        accept(await submitOrRecover(job, sendJob, readJob));
        setRestoring(false);
      } else {
        setConnected(false);
        setError(cause instanceof Error ? cause.message : '상태를 확인하지 못했습니다.');
      }
    }
  }

  function chooseIdea(value: string) {
    setPrompt(value);
    promptRef.current?.querySelector('textarea')?.focus({ preventScroll: true });
    if (window.innerWidth < 800) promptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return <>
    <StudioNav connected={connected} />
    <div className="studio-shell">
      <aside className="tool-rail" aria-label="현재 작업 공간">
        <span className="rail-active" title="이미지 스튜디오"><Icon name="image" size={21} /></span>
        <span className="rail-line" /><span className="rail-label">CREATE</span><span className="rail-bottom">CS</span>
      </aside>
      <main className="studio-main">
        <div className="page-heading">
          <div><div className="heading-eyebrow"><span />YOUR PERSONAL CREATIVE SPACE</div>
            <h1>상상을, 이미지로<span>.</span></h1><p>당신의 아이디어에 딱 맞는 한 장을 만들어보세요.</p></div>
          <span className="workspace-badge"><Icon name="sparkles" size={15} />IMAGE STUDIO<span>01</span></span>
        </div>
        <div className="workspace">
          <div ref={promptRef}>
            <GenerationForm models={models} modelId={modelId} sizeId={sizeId} prompt={prompt} busy={busy}
              connected={connected} onModel={value => { setModelId(value); setSizeId('square'); }}
              onSize={setSizeId} onPrompt={setPrompt} onSubmit={submit} onRefresh={refresh} />
          </div>
          <GenerationResult job={job} result={result} elapsed={elapsed} error={error} onIdea={chooseIdea}
            onExpand={() => setExpanded(true)} onReconnect={reconnect} busy={busy} />
        </div>
        <footer className="studio-footer"><span>LESS SETUP. MORE IMAGINATION.</span>
          <span>나만의 크리에이티브 스튜디오 <span className="footer-dot">✦</span></span></footer>
      </main>
    </div>
    {expanded && result && <ImageLightbox result={result} onClose={() => setExpanded(false)} />}
  </>;
}
