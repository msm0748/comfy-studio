import { listPresetDefinitions } from './presets.ts';
import type { GenerationInput } from './types.ts';

export function validateGenerationInput(value: unknown): GenerationInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('입력 형식을 확인해 주세요.');
  const data = value as Record<string, unknown>;
  const preset = listPresetDefinitions().find(p => p.id === data.modelId);
  if (!preset || !preset.sizes.some(s => s.id === data.sizeId)) throw new Error('모델 또는 사이즈를 다시 선택해 주세요.');
  const allowed=preset.mode==='edit'?['modelId','prompt','sizeId','referenceId','preserveIdentity']:['modelId','prompt','sizeId'];
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new Error('허용되지 않은 설정입니다.');
  if (typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.trim().length > 8000) throw new Error('프롬프트를 1~8,000자로 입력해 주세요.');
  const input:GenerationInput={ modelId: preset.id, prompt: data.prompt.trim(), sizeId: data.sizeId as GenerationInput['sizeId'] };
  if(preset.mode==='edit'){
    if(typeof data.referenceId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.referenceId))throw new Error('편집할 참조 이미지를 먼저 선택해 주세요.');
    if(data.preserveIdentity!==undefined&&typeof data.preserveIdentity!=='boolean')throw new Error('인물 유지 설정을 확인해 주세요.');
    input.referenceId=data.referenceId;input.preserveIdentity=data.preserveIdentity??true;
  }
  return input;
}
