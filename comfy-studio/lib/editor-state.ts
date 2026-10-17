import type { GenerationInput,ReferenceRecord } from './types.ts';
export async function restoreEditorState(input:GenerationInput,readReference:(id:string)=>Promise<ReferenceRecord>){
  let reference:ReferenceRecord|null=null;let referenceError='';
  if(input.referenceId){try{reference=await readReference(input.referenceId);}catch{referenceError='이전 참조 이미지를 불러오지 못했습니다. 연결 확인 및 요청 복구를 누르거나 다시 선택해 주세요.';}}
  return {input,reference,referenceError};
}
