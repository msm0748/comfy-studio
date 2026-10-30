import type {VideoAspect,VideoModel,VideoPreset,VideoResolution} from './types.ts';
export const VIDEO_WIDTH=864,VIDEO_HEIGHT=480,VIDEO_FPS=24;
// Results made before Singularity became the only model keep their label.
export const VIDEO_MODEL_LABELS:Record<VideoModel,string>={h3:'MiniMax H3',fasth3:'FastH3',singularity:'Singularity V2'};
export const VIDEO_PRESETS:readonly VideoPreset[]=[
 {id:'720p',label:'720p HD',width:1280,height:720,maxSeconds:10,description:'HD 출력 · 추천'},
 {id:'1080p',label:'1080p Full HD',width:1920,height:1080,maxSeconds:10,description:'Full HD 출력'},
];
export function getVideoPreset(id:VideoResolution):VideoPreset{const preset=VIDEO_PRESETS.find(p=>p.id===id);if(!preset)throw new Error('영상 해상도를 다시 선택해 주세요.');return {...preset};}
export function videoOutputSize(resolution:VideoResolution,aspect:VideoAspect='landscape'){const {width,height}=getVideoPreset(resolution);return aspect==='portrait'?{width:height,height:width}:{width,height};}
// Both passes must land on the 32px latent grid, so 720p output is cropped from the 736px side.
export function videoLayout(aspect:VideoAspect='landscape'){return aspect==='portrait'?{base:{width:VIDEO_HEIGHT,height:VIDEO_WIDTH},refine:{width:736,height:1280},crop:{width:720,height:1280,x:8,y:0}}:{base:{width:VIDEO_WIDTH,height:VIDEO_HEIGHT},refine:{width:1280,height:736},crop:{width:1280,height:720,x:0,y:8}};}
export const videoAspectFor=(image:{width:number;height:number}):VideoAspect=>image.height>image.width?'portrait':'landscape';
export function videoFrames(seconds:number):number{if(!Number.isInteger(seconds)||seconds<5||seconds>10)throw new Error('영상 길이는 5~10초 사이로 선택해 주세요.');return Math.ceil((seconds*VIDEO_FPS-5)/17)*17+5;}
