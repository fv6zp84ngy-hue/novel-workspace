import {uid,now,digest,toBase64} from './domain.mjs?v=0.3.1';
export const LIMITS={count:20,file:2*1024*1024,batch:20*1024*1024};
export async function importFile(repo,workId,file,allowDuplicate=false){
  if(!/\.(txt|md)$/i.test(file.name))throw new Error('只支持 TXT 和 Markdown 文件。');
  if(file.size>LIMITS.file)throw new Error('单文件超过 2 MiB。');
  const bytes=new Uint8Array(await file.arrayBuffer());let content;
  try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('无法按 UTF-8 读取，请先另存为 UTF-8 文本。');}
  if(!content.trim())throw new Error('文件没有可导入的文字。');
  const sha256=await digest(bytes);const duplicate=(await repo.list('sources')).find(s=>s.workId===workId&&s.sha256===sha256);
  if(duplicate&&!allowDuplicate){const error=new Error('同样的内容已导入过。');error.name='DuplicateError';throw error;}
  const source={id:uid(),workId,originalName:file.name,mime:file.type||'text/plain',byteLength:bytes.byteLength,sha256,base64:toBase64(bytes),importedAt:now()};
  return repo.addDocument(workId,'material',file.name.replace(/\.(txt|md)$/i,''),content,source);
}
