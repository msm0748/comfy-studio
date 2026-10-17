import test from 'node:test';
import assert from 'node:assert/strict';
import {createPromptTranslator} from '../lib/translate-prompt.ts';
import {createTranslationAccessToken} from '../lib/translation-auth.ts';
const project='koharu-market-492802';
const credentials={type:'service_account',project_id:project,client_email:`comfy-studio-translator@${project}.iam.gserviceaccount.com`,private_key:'test-private-key',private_key_id:'test-id'};
test('dedicated service account caches its client and accepts only the designated translation identity',async()=>{
 let raw=JSON.stringify(credentials),clients=0;const seen:Record<string,unknown>[]=[];
 const token=createTranslationAccessToken({credentialsFile:()=> 'test.json',project:()=>project,read:async()=>raw,client:options=>{clients++;seen.push(options);return {getAccessToken:async()=>({token:'test-token'})};}});
 assert.equal(await token(),'test-token');assert.equal(await token(),'test-token');assert.equal(clients,1);
 assert.deepEqual(seen[0].scopes,['https://www.googleapis.com/auth/cloud-translation']);
 raw=JSON.stringify({...credentials,private_key:'rotated'});await token();assert.equal(clients,2);
 for(const invalid of [{...credentials,client_email:'other@other.iam.gserviceaccount.com'},{...credentials,project_id:'other'},{...credentials,type:'authorized_user'}]){raw=JSON.stringify(invalid);await assert.rejects(token(),/전용 서비스 계정/);}
});
test('v3 translation uses a bearer token, automatic language detection, and preserves English and literal text',async()=>{
 const calls:Record<string,unknown>[]=[];
 const translate=createPromptTranslator({project:()=>project,token:async()=> 'test-token',fetch:async(url,options)=>{
  assert.equal(String(url),`https://translation.googleapis.com/v3/projects/${project}/locations/global:translateText`);
  const headers=new Headers(options?.headers);assert.equal(headers.get('Authorization'),'Bearer test-token');assert.equal(headers.has('X-Goog-Api-Key'),false);
  const body=JSON.parse(String(options?.body));calls.push(body);
  return Response.json({translations:[{translatedText:'A cat &amp; dog',detectedLanguageCode:body.contents[0]==='a red chair'?'en':'ko'}]});
 }});
 assert.equal(await translate('한글'),'A cat &amp; dog');assert.equal(await translate('a red chair'),'a red chair');await translate('une chaise rouge');
 for(const body of calls){assert.equal(body.targetLanguageCode,'en');assert.equal(body.mimeType,'text/plain');assert.equal(body.sourceLanguageCode,undefined);}
});
