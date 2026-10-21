export type ModelId = 'z-image' | 'qwen-2512' | 'krea-2' | 'moss-image' | 'qwen-edit-2511' | 'z-image-edit';
export type StudioMode = 'generate' | 'edit';
export type SizeId = 'square' | 'portrait' | 'landscape' | 'wide' | 'tall';
export type SizeOption = { id: SizeId; label: string; use: string; width: number; height: number; recommended?: boolean };
export type GenerationInput = { modelId: ModelId; prompt: string; sizeId: SizeId; referenceId?:string; preserveIdentity?:boolean; strength?:'weak'|'medium'|'strong' };
export type ReferenceRecord = { id:string; width:number; height:number; createdAt:string; sourceJobId?:string };
export type Preset = { id: ModelId; mode:StudioMode; name: string; description: string; tag: string; workflowFile: string; sizes: SizeOption[]; commercial: { label: string; license: string; conditional: boolean; condition?: string } };
export type ModelOption = Preset & { available: boolean; reason?: string };
export type ApiGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
export type NodeInfo = Record<string, { input: { required?: Record<string, unknown[]>; optional?: Record<string, unknown[]> }; input_order?: { required?: string[]; optional?: string[] }; output?: string[] }>;
export type ImageRef = { filename: string; subfolder: string; type: 'output' };
export type JobRecord = {
  id: string; promptId: string | null; input: GenerationInput; createdAt: string;
  state: 'submitting' | 'queued' | 'running' | 'completed' | 'failed';
  images: ImageRef[]; error?: string; width: number; height: number;
};
