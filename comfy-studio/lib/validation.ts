import { listPresetDefinitions } from './presets.ts';
import type { GenerationInput } from './types.ts';

export function validateGenerationInput(value: unknown): GenerationInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('입력 형식을 확인해 주세요.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !['modelId','prompt','sizeId'].includes(key))) throw new Error('허용되지 않은 설정입니다.');
  const preset = listPresetDefinitions().find(p => p.id === data.modelId);
  if (!preset || !preset.sizes.some(s => s.id === data.sizeId)) throw new Error('모델 또는 사이즈를 다시 선택해 주세요.');
  if (typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.trim().length > 8000) throw new Error('프롬프트를 1~8,000자로 입력해 주세요.');
  return { modelId: preset.id, prompt: data.prompt.trim(), sizeId: data.sizeId as GenerationInput['sizeId'] };
}
