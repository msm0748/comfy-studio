import { PreparationError } from './jobs.ts';

type Dependencies={key:()=>string|undefined;fetch:typeof fetch};
function decodeEntities(text:string):string{
 const named:Record<string,string>={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'};
 return text.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi,(original,entity:string)=>{
  if(entity[0]!=='#')return named[entity.toLowerCase()]??original;
  const code=entity[1]?.toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));
  return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):original;
 });
}
export function createPromptTranslator(overrides:Partial<Dependencies>={}){
 const deps:Dependencies={key:()=>process.env.GOOGLE_TRANSLATE_API_KEY,fetch:(...args)=>fetch(...args),...overrides};
 return async(prompt:string):Promise<string>=>{
  const key=deps.key()?.trim();
  if(!key)throw new PreparationError('자동 번역 API 키 설정을 확인해 주세요.');
  let response:Response;
  try{
   response=await deps.fetch('https://translation.googleapis.com/language/translate/v2',{
    method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key},
    body:JSON.stringify({q:prompt,target:'en',format:'text'}),cache:'no-store',signal:AbortSignal.timeout(8000),
   });
  }catch{throw new PreparationError('프롬프트 번역 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');}
  if(!response.ok)throw new PreparationError(response.status===403?'자동 번역 권한을 확인해 주세요. Google API 키의 허용 IP와 Translation API 설정을 확인해야 합니다.':'프롬프트 번역에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  try{
   const data=await response.json();const item=data?.data?.translations?.[0];
   if(typeof item?.translatedText!=='string'||!item.translatedText.trim()||item.translatedText.length>32000)throw new Error();
   // Send every script through Google's language detection; ASCII can also be French, German, etc.
   return item.detectedSourceLanguage==='en'?prompt:decodeEntities(item.translatedText).trim();
  }catch{throw new PreparationError('프롬프트 번역 결과를 확인하지 못했습니다. 다시 시도해 주세요.');}
 };
}
export const translatePrompt=createPromptTranslator();
