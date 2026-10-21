export type VideoMode='text'|'image';
export type VideoResolution='480p'|'720p'|'1080p';
export type VideoUpscale='fast'|'ai';
// Absent model means MiniMax H3 so stored jobs keep their meaning.
export type VideoModel='h3'|'fasth3';
export type VideoInput={mode:VideoMode;prompt:string;resolution:VideoResolution;durationSeconds:number;referenceId?:string;upscale?:VideoUpscale;sourceJobId?:string;model?:VideoModel};
export type VideoOutputRef={filename:string;subfolder:string;type:'output'};
export type VideoMedia={kind:'comfy';ref:VideoOutputRef}|{kind:'local';filename:string};
export type VideoPreset={id:VideoResolution;label:string;width:number;height:number;maxSeconds:number;description:string};
export type VideoJobRecord={id:string;promptId:string|null;input:VideoInput;createdAt:string;state:'submitting'|'queued'|'running'|'processing'|'completed'|'failed';phase:'generation'|'upscale'|'encoding'|null;sourceOutput?:VideoOutputRef;originalOutput?:VideoOutputRef;media?:VideoMedia;error?:string;generationWidth:number;generationHeight:number;width:number;height:number;frames:number;fps:number;actualDurationSeconds:number};
export type VideoInspection={state:'queued'|'running'|'completed'|'failed';output?:VideoOutputRef;originalOutput?:VideoOutputRef;error?:string};
export type VideoAvailability={upscale?:VideoUpscale;model?:VideoModel;connected:boolean;modes:{id:VideoMode;available:boolean;reason?:string;presets:(VideoPreset&{available:boolean;verified:boolean;reason?:string})[]}[]};
