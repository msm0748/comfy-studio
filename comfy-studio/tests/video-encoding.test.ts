import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {createVideoEncoder} from '../lib/video/encoding.ts';
test('Full HD encoder shares concurrent work, preserves audio arguments and reuses completed output',async()=>{
 await mkdir('.data/test-tmp',{recursive:true});const directory=await mkdtemp(path.resolve('.data/test-tmp/encode-'));const id=randomUUID();let runs=0;
 const encoder=createVideoEncoder({directory,fetch:async()=>new Response('source',{headers:{'content-type':'video/mp4'}}),run:async(_exe,args)=>{runs++;assert.ok(args.includes('scale=1920:1080:flags=lanczos'));assert.equal(args[args.indexOf('-c:a')+1],'copy');await writeFile(args.at(-1)!,'encoded');}});
 try{const source={filename:'x.mp4',subfolder:'video',type:'output' as const};const [a,b]=await Promise.all([encoder.encode(id,source),encoder.encode(id,source)]);assert.deepEqual(a,b);assert.equal(runs,1);assert.deepEqual(await encoder.encode(id,source),a);assert.equal(runs,1);}finally{await rm(directory,{recursive:true,force:true});}
});
