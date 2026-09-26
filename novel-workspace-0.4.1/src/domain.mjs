export const CATEGORIES = {inbox:'待整理',character:'人物',plot:'情节冲突',world:'场景设定',clue:'线索时间',inspiration:'灵感碎片',reference:'外部参考'};
export const CATEGORY_HINTS = {inbox:'还没决定用途？先放这里，随时能搜索和改分类。',character:'人物想要什么、害怕什么，以及彼此关系。',plot:'一场事件、人物的阻碍或剧情转折。',world:'地点、氛围、规则，以及规则的代价。',clue:'伏笔、回收位置、事件先后与时间线。',inspiration:'暂时不属于某一章的画面、句子或点子。',reference:'查阅的外部材料、摘录及其来源。'};
export const KINDS = {chapter:'章节',outline:'大纲',material:'资料'};
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const escapeHTML = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const STORES = ['works','documents','revisions','sources','relations','tasks','meta'];
export class ConflictError extends Error {constructor(current){super('另一处已修改这份内容。你的修改仍保留着，请保留为副本。');this.name='ConflictError';this.current=current;}}
export function createDocument(workId,kind,title='',content='') {return {id:uid(),workId,kind,title:title.trim()||({chapter:'新章节',outline:'故事大纲',material:'未命名资料'}[kind]),content,parentId:null,order:Date.now(),revision:1,category:'inbox',tags:[],sourceId:null,createdAt:now(),updatedAt:now(),deletedAt:null};}
export function snapshot(doc,reason='edit'){return {id:uid(),documentId:doc.id,workId:doc.workId,revision:doc.revision,title:doc.title,content:doc.content,category:doc.category,reason,createdAt:now()};}
export async function digest(data){const bytes=typeof data==='string'?new TextEncoder().encode(data):data;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function searchDocuments(documents,workId,query){const q=query.trim().toLocaleLowerCase();if(!q)return [];const terms=q.split(/\s+/).filter(Boolean);return documents.filter(d=>d.workId===workId&&!d.deletedAt).map(d=>{const title=d.title.toLocaleLowerCase(),text=d.content.toLocaleLowerCase();const score=terms.reduce((n,t)=>n+(title.includes(t)?8:0)+(text.includes(t)?2:0),0);if(!terms.every(t=>title.includes(t)||text.includes(t)))return null;const at=Math.max(0,text.indexOf(terms.find(t=>text.includes(t))||q));return {document:d,score,offset:at,snippet:d.content.slice(Math.max(0,at-28),at+130)};}).filter(Boolean).sort((a,b)=>b.score-a.score);}
export function categorySuggestion(doc){
  const title=doc.title||'',content=doc.content||'';
  const rules=[
    ['character',/人物|配角|父亲|母亲|性格|姓名|动机|关系/,'提到人物、动机或关系'],
    ['plot',/情节|冲突|阻碍|转折|高潮|剧情|事件|目标|抉择/,'提到事件、阻碍或转折'],
    ['world',/场景|世界观|规则|地点|城镇|地理|魔法|城市|氛围/,'提到地点、氛围或世界规则'],
    ['clue',/伏笔|线索|时间线|日程|日期|第几天|回收|怀表|匿名信/,'提到线索、回收或事件先后'],
    ['reference',/参考|摘录|出处|来源|资料来源|https?:/,'提到外部来源或摘录'],
    ['inspiration',/灵感|点子|脑洞|画面|构思/,'包含还未归入情节的想法']
  ];
  const match=rules.find(([,pattern])=>pattern.test(title))||rules.find(([,pattern])=>pattern.test(content));
  return match?{category:match[0],reason:match[2]}:{category:'inbox',reason:'用途还不明确，先放待整理'};
}
export function validateBackup(data){
  const fail=message=>{throw new Error('备份无效：'+message);};
  if(!data||data.format!=='novel-workspace-backup'||data.schemaVersion!==1)fail('格式或版本不支持');
  for(const key of STORES)if(!Array.isArray(data[key]))fail(key+' 列表缺失');
  const all=new Set();for(const key of STORES)for(const row of data[key]){if(!row||typeof row.id!=='string'||!row.id||all.has(row.id))fail('编号缺失或重复');all.add(row.id);}
  const works=new Set(data.works.map(w=>w.id)),docs=new Map(data.documents.map(d=>[d.id,d])),sources=new Map(data.sources.map(s=>[s.id,s]));
  const str=(x)=>typeof x==='string';
  for(const w of data.works)if(!str(w.title)||!str(w.createdAt))fail('作品字段错误');
  for(const d of data.documents){if(!works.has(d.workId)||!Object.hasOwn(KINDS,d.kind)||!str(d.title)||!str(d.content)||!Number.isInteger(d.revision)||d.revision<1||!Number.isFinite(d.order)||!Object.hasOwn(CATEGORIES,d.category)||!Array.isArray(d.tags)||!d.tags.every(str))fail('文档字段错误');if(d.sourceId&&(!sources.has(d.sourceId)||sources.get(d.sourceId).workId!==d.workId))fail('原始来源缺失或跨作品');if(d.parentId){const parent=docs.get(d.parentId);if(!parent||parent.workId!==d.workId)fail('父节点缺失或跨作品');const seen=new Set([d.id]);let p=parent;while(p){if(seen.has(p.id))fail('循环章节结构');seen.add(p.id);p=docs.get(p.parentId);}}}
  const revisionKeys=new Set();
  for(const r of data.revisions){const key=r.documentId+':'+r.revision;if(revisionKeys.has(key))fail('重复历史版本');revisionKeys.add(key);const d=docs.get(r.documentId);if(!d||d.workId!==r.workId||!str(r.content)||!str(r.title)||!Object.hasOwn(CATEGORIES,r.category)||!Number.isInteger(r.revision)||r.revision<1||r.revision>d.revision)fail('历史版本无效');}
  for(const t of data.tasks)if(!works.has(t.workId)||!str(t.text)||!t.text.trim()||!Number.isInteger(t.revision)||t.revision<1||typeof t.done!=='boolean'||(t.chapterId&&(docs.get(t.chapterId)?.workId!==t.workId||docs.get(t.chapterId)?.kind!=='chapter')))fail('任务字段或章节引用错误');
  const relationKeys=new Set();
  for(const r of data.relations){const key=r.fromId+':'+r.toId;if(relationKeys.has(key))fail('重复章节关联');relationKeys.add(key);if(!works.has(r.workId)||docs.get(r.fromId)?.workId!==r.workId||docs.get(r.toId)?.workId!==r.workId||docs.get(r.fromId)?.kind!=='material'||docs.get(r.toId)?.kind!=='chapter')fail('关联缺失、类型错误或跨作品');}
  for(const s of data.sources)if(!works.has(s.workId)||!str(s.originalName)||!str(s.base64)||!str(s.sha256)||!Number.isInteger(s.byteLength)||s.byteLength<0)fail('原始文件字段错误');
  return data;
}
export async function verifyBackup(data){validateBackup(data);const payload={};for(const key of STORES)payload[key]=data[key];if(data.checksum!==await digest(JSON.stringify(payload)))throw new Error('备份校验失败，文件可能已损坏。');for(const source of data.sources){let bytes;try{bytes=Uint8Array.from(atob(source.base64),c=>c.charCodeAt(0));}catch{throw new Error('备份中的原始文件无法读取。');}if(bytes.byteLength!==source.byteLength||await digest(bytes)!==source.sha256)throw new Error('原始文件校验失败。');}return data;}
export function remapBackup(data){validateBackup(data);const map=new Map();for(const key of STORES)for(const row of data[key])map.set(row.id,uid());const out={};for(const key of STORES){out[key]=key==='meta'?[]:data[key].map(row=>{const r={...row,id:map.get(row.id)};for(const field of ['workId','documentId','sourceId','parentId','fromId','toId','chapterId'])if(r[field])r[field]=map.get(r[field]);if(key==='documents')r.syncId=row.syncId||row.id;if(key==='works')r.title+=' · 恢复副本';return r;});}return out;}
export function toBase64(bytes){let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result);}
