import test from 'node:test';
import assert from 'node:assert/strict';
import { handleReferencePost } from '../lib/reference-api.ts';
const id='12345678-1234-4234-8234-123456789abc';
const record={id,width:10,height:10,createdAt:new Date().toISOString()};
test('reference API accepts one uploaded file or one verified completed job output',async()=>{
  const created:{bytes:number[];source?:string}[]=[];
  const deps={references:{create:async(bytes:Uint8Array,source?:string)=>{created.push({bytes:[...bytes],source});return record;}},getGenerationImage:async(jobId:string,index:number)=>{assert.equal(jobId,id);assert.equal(index,0);return new Response(new Uint8Array([3,4]),{headers:{'Content-Type':'image/png'}});}};
  const form=new FormData();form.set('image',new File([new Uint8Array([1,2])],'../../outside.png',{type:'image/png'}));
  assert.deepEqual(await handleReferencePost(new Request('http://local',{method:'POST',body:form}),deps),record);
  await handleReferencePost(new Request('http://local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceJobId:id,index:0})}),deps);
  assert.deepEqual(created,[{bytes:[1,2],source:undefined},{bytes:[3,4],source:id}]);
});
test('reference API rejects extra fields, duplicate files, hostile paths, incomplete jobs and oversized bodies',async()=>{
  let created=0;const deps={references:{create:async()=>{created++;return record;}},getGenerationImage:async()=>{throw Object.assign(new Error('not complete'),{status:404});}};
  for(const value of [{sourceJobId:'../output.png'},{sourceJobId:id,index:-1},{sourceJobId:id,index:'0'},{sourceJobId:id,url:'https://example.com'},[],{sourceJobId:id,index:0}]){
    await assert.rejects(()=>handleReferencePost(new Request('http://local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}),deps));
  }
  for(const extra of ['image','path']){const form=new FormData();form.append('image',new File(['x'],'a.png'));form.append(extra,new File(['x'],'b.png'));await assert.rejects(()=>handleReferencePost(new Request('http://local',{method:'POST',body:form}),deps));}
  await assert.rejects(()=>handleReferencePost(new Request('http://local',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(4097)}),deps),{status:413});
  await assert.rejects(()=>handleReferencePost(new Request('http://local',{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=a'},body:new Uint8Array(20*1024*1024)}),deps),{status:413});
  assert.equal(created,0);
});
