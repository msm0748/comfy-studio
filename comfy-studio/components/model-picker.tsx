'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { ModelId, ModelOption } from '@/lib/types';
import { Icon } from './icon';

type Props = { models: ModelOption[]; value: ModelId; disabled: boolean; onChange: (id: ModelId) => void };

export function ModelPicker({ models, value, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<ModelId | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef({ text: '', time: 0 });
  const listId = useId();
  const selected = models.find(model => model.id === value);
  const enabled = models.filter(model => model.available);
  const blocked = disabled || !models.length;
  const expanded = open && !blocked;
  const active = enabled.find(model => model.id === highlighted) ?? enabled[0];

  useEffect(() => {
    if (!expanded) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [expanded]);

  useEffect(() => {
    if (expanded && active) document.getElementById(`${listId}-${active.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [expanded, active, listId]);

  function show() {
    setHighlighted(selected?.available ? selected.id : enabled[0]?.id ?? null);
    setOpen(true);
  }
  function choose(model: ModelOption) {
    if (!model.available || blocked) return;
    onChange(model.id);
    setOpen(false);
    trigger.current?.focus();
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (blocked) return;
    if (event.key === 'Escape') { if (expanded) event.preventDefault(); setOpen(false); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!expanded) show();
      else if (active) choose(active);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!expanded) show();
      const current = enabled.findIndex(model => model.id === active?.id);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
        : !expanded ? Math.max(0, enabled.findIndex(model => model.id === value))
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
      setHighlighted(enabled[next]?.id ?? null);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      search.current = { text: (now - search.current.time > 700 ? '' : search.current.text) + event.key.toLowerCase(), time: now };
      const match = enabled.find(model => model.name.toLowerCase().startsWith(search.current.text));
      if (match) { setHighlighted(match.id); setOpen(true); }
    }
  }

  return <div className="model-picker" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button id="model" ref={trigger} type="button" role="combobox" aria-label={`모델: ${selected?.name ?? '불러오는 중'}${selected ? `, ${selected.commercial.label}` : ''}`}
      aria-haspopup="listbox" aria-expanded={expanded} aria-controls={listId}
      aria-activedescendant={expanded && active ? `${listId}-${active.id}` : undefined}
      className={`model-trigger${expanded ? ' is-open' : ''}`} disabled={blocked}
      onClick={() => expanded ? setOpen(false) : show()} onKeyDown={keyboard}>
      <span className="model-emblem"><Icon name="bolt" size={19}/></span>
      <span className="model-trigger-copy"><strong>{selected?.name ?? '모델 불러오는 중…'}</strong>
        {selected && <span className={`commercial-badge ${selected.commercial.conditional ? 'conditional' : ''}`}><span/>{selected.commercial.label}</span>}
      </span>
      <Icon name="chevron" size={17} className="model-chevron"/>
    </button>
    {expanded && <div className="model-menu">
      <div className="model-menu-heading"><span>내 PC의 이미지 모델</span><span>{models.length} MODELS</span></div>
      <div id={listId} role="listbox" aria-label="이미지 모델" className="model-options">
        {models.map(model => <div key={model.id} id={`${listId}-${model.id}`} role="option"
          aria-selected={model.id === value} aria-disabled={!model.available}
          className={`model-option${model.id === value ? ' is-selected' : ''}${model.id === active?.id ? ' is-highlighted' : ''}${!model.available ? ' is-unavailable' : ''}`}
          onPointerMove={() => model.available && setHighlighted(model.id)}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(model)}>
          <span className="model-option-top"><strong>{model.name}</strong><span className="model-option-check">{model.id === value && <Icon name="check" size={15}/>}</span></span>
          <span className="model-option-description">{model.available ? model.description : model.reason ?? '현재 사용할 수 없는 모델입니다.'}</span>
          <span className="model-option-meta"><span className={`commercial-badge ${model.commercial.conditional ? 'conditional' : ''}`}><span/>{model.commercial.label}</span><span className="model-license">{model.commercial.license}</span>{!model.available && <span className="model-unavailable-label">사용 불가</span>}</span>
          {model.commercial.condition && <span className="model-license-condition">{model.commercial.condition}</span>}
        </div>)}
      </div>
      <div className="model-menu-footnote">저장된 모델별 생성 설정을 사용합니다.</div>
    </div>}
  </div>;
}
