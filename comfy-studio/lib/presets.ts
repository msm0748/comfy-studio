import type { ModelId, Preset, SizeOption } from './types.ts';

const sizes = (qwen: boolean): SizeOption[] => {
  const dimensions = qwen ? [[1328,1328],[1104,1472],[1472,1104],[1664,928],[928,1664]] : [[1024,1024],[896,1152],[1152,896],[1344,768],[768,1344]];
  return (['square','portrait','landscape','wide','tall'] as const).map((id, i) => ({
    id, label: ['정사각형','세로형','가로형','와이드','모바일 세로'][i],
    use: ['피드 · 제품 이미지','인물 · 포스터','풍경 · 콘텐츠','배너 · 썸네일','스토리 · 모바일'][i],
    width: dimensions[i][0], height: dimensions[i][1], recommended: i === 0,
  }));
};
const presets: Preset[] = [
  { id:'z-image', name:'Z-Image Turbo', description:'일상의 순간부터 새로운 아이디어까지', tag:'빠른 시작', workflowFile:'T2I_Z-Image-Turbo.json', sizes:sizes(false), commercial:{label:'상업 이용 가능',license:'Apache-2.0',conditional:false} },
  { id:'qwen-2512', name:'Qwen Image 2512', description:'디테일을 꼼꼼하게 담는 이미지', tag:'섬세한 표현', workflowFile:'T2I_Qwen-Image-2512.json', sizes:sizes(true), commercial:{label:'상업 이용 가능',license:'Apache-2.0',conditional:false} },
  { id:'krea-2', name:'Krea 2 Turbo', description:'나만의 감각을 더하는 크리에이티브', tag:'크리에이티브', workflowFile:'Krea2-Turbo-RTX3090.json', sizes:sizes(false), commercial:{label:'상업 이용 조건부 허용',license:'Krea 2 Community',conditional:true,condition:'연 매출 $1M 미만 · 50석 미만'} },
];
export function listPresetDefinitions(): Preset[] { return structuredClone(presets); }
export function getPreset(id: ModelId): Preset {
  const preset = presets.find(p => p.id === id);
  if (!preset) throw new Error('지원하지 않는 모델입니다.');
  return structuredClone(preset);
}
