/** Cuts the chosen range in the browser so only that part is uploaded. Loaded on demand: the library is large. */
export async function cutVideo(file:File,start:number,end:number,onProgress:(ratio:number)=>void):Promise<File>{
 const {ALL_FORMATS,BlobSource,BufferTarget,Conversion,Input,Mp4OutputFormat,Output}=await import('mediabunny');
 const input=new Input({formats:ALL_FORMATS,source:new BlobSource(file)});
 try{
  const output=new Output({format:new Mp4OutputFormat(),target:new BufferTarget()});
  // Packets are copied, so no browser encoder is needed; the server resizes. A short tail covers its frame grid.
  const conversion=await Conversion.init({input,output,trim:{start,end:end+0.3},showWarnings:false});
  if(!conversion.isValid)throw new Error('이 브라우저에서 처리할 수 없는 영상 형식입니다.');
  conversion.onProgress=onProgress;await conversion.execute();
  const buffer=output.target.buffer;if(!buffer)throw new Error('영상을 자르지 못했습니다.');
  return new File([buffer],'clip.mp4',{type:'video/mp4'});
 }finally{input.dispose();}
}
