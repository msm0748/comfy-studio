export type MusicInput={mode:'vocal'|'instrumental';prompt:string;lyrics:string;language:'ko'|'en'|'ja';durationSeconds:number};
export type MusicFormat='mp3'|'flac';
export type MusicOutput={filename:string;subfolder:string;type:'output'};
export type MusicInspection={state:'queued'|'running'|'completed'|'failed';outputs?:Partial<Record<MusicFormat,MusicOutput>>;error?:string};
export type MusicJob=Omit<MusicInspection,'state'>&{id:string;promptId:string|null;input:MusicInput;createdAt:string;state:MusicInspection['state']|'submitting'};
export type MusicAvailability={connected:boolean;available:boolean;maxSeconds:number;verified:boolean;reason?:string};
