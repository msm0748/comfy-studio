export type MusicVocalGender='auto'|'female'|'male';
export type MusicInput={mode:'vocal'|'instrumental';prompt:string;lyrics:string;language:'ko'|'en'|'ja';durationSeconds?:number;durationMode?:'auto';vocalGender?:MusicVocalGender};
export type MusicFormat='mp3'|'flac';
export type MusicOutput={filename:string;subfolder:string;type:'output'};
export type MusicInspection={state:'queued'|'running'|'completed'|'failed';outputs?:Partial<Record<MusicFormat,MusicOutput>>;actualDurationSeconds?:number;endingVerified?:boolean;error?:string};
export type MusicJob=Omit<MusicInspection,'state'>&{id:string;promptId:string|null;input:MusicInput;createdAt:string;state:MusicInspection['state']|'submitting'};
export type MusicAvailability={connected:boolean;available:boolean;maxSeconds:number;verified:boolean;autoEnding?:boolean;reason?:string};
