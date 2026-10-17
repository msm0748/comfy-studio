import test from 'node:test';
import assert from 'node:assert/strict';
import { createPromptTranslator } from '../lib/translate-prompt.ts';

test('auto detects all source languages, requests plain English and preserves English verbatim',async()=>{
 const seen:Record<string,unknown>[]=[];
 const translate=createPromptTranslator({key:()=> 'test-key',fetch:async(url,options)=>{assert.equal(String(url),'https://translation.googleapis.com/language/translate/v2');assert.equal(new Headers(options?.headers).get('X-Goog-Api-Key'),'test-key');const body=JSON.parse(String(options?.body));seen.push(body);return Response.json({data:{translations:[{translatedText:'a person by the ocean',detectedSourceLanguage:body.q==='a red chair'?'en':'ko'}]}});}});
 assert.equal(await translate('해변에 있는 사람'),'a person by the ocean');
 assert.equal(await translate('a red chair'),'a red chair');
 await translate('une chaise rouge');assert.equal(seen.length,3);
 for(const body of seen){assert.equal(body.target,'en');assert.equal(body.format,'text');assert.equal(body.source,undefined);}
});
test('missing key, denied permission, corrupt reply and network failures stop preparation without exposing provider details',async()=>{
 await assert.rejects(createPromptTranslator({key:()=>undefined})('한글'),/설정/);
 for(const fetch of [async()=>Response.json({error:{message:'test-key secret prompt'}},{status:403}),async()=>Response.json({data:{translations:[]}}),async()=>{throw Error('test-key');}]){
 const translate=createPromptTranslator({key:()=> 'test-key',fetch});
 await assert.rejects(translate('한글'),error=>{assert.ok(error instanceof Error);assert.doesNotMatch(error.message,/test-key|secret prompt/);return true;});
 }
});
test('HTML-escaped translation is decoded once without interpreting user markup',async()=>{
 const translate=createPromptTranslator({key:()=> 'test-key',fetch:async()=>Response.json({data:{translations:[{translatedText:'A &quot;cat&quot; &amp; a dog&#39;s collar &lt;blue&gt; &#x1F600;',detectedSourceLanguage:'fr'}]}})});
 assert.equal(await translate('un chat'),'A "cat" & a dog\'s collar <blue> 😀');
});
