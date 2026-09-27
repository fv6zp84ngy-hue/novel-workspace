import {retentionPlan} from './intelligence.mjs?v=0.4.0';
import {STORES,CATEGORIES,uid,now,createDocument,snapshot,ConflictError,digest,verifyBackup,remapBackup} from './domain.mjs?v=0.4.0';
const req=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
export class Repository {
  constructor(name='novel-author-v1'){this.name=name;this.db=null;this.channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(name):null;}
  async open(){this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open(this.name,1);r.onupgradeneeded=()=>{for(const key of STORES)if(!r.result.objectStoreNames.contains(key))r.result.createObjectStore(key,{keyPath:'id'});};r.onblocked=()=>reject(new Error('另一个窗口正在使用旧版资料库，请关闭后重试。'));r.onerror=()=>reject(r.error);r.onsuccess=()=>{resolve(r.result);r.result.onversionchange=()=>r.result.close();};});return this;}
  close(){this.db?.close();this.channel?.close();}
  transact(keys,action){return new Promise((resolve,reject)=>{const tx=this.db.transaction(keys,'readwrite');let value,reason;const store=key=>tx.objectStore(key);const abort=e=>{reason=e;tx.abort();};tx.oncomplete=()=>{this.channel?.postMessage({changed:true});resolve(value);};tx.onabort=()=>reject(reason||tx.error||new Error('保存未完成，请重试。'));tx.onerror=()=>{};try{action(store,v=>value=v,abort);}catch(e){abort(e);}});}
  async list(key){return req(this.db.transaction(key).objectStore(key).getAll());}
  async get(key,id){return req(this.db.transaction(key).objectStore(key).get(id));}
  async all(){const tx=this.db.transaction(STORES);const values=await Promise.all(STORES.map(key=>req(tx.objectStore(key).getAll())));return Object.fromEntries(STORES.map((key,i)=>[key,values[i]]));}
  async setMeta(id,value){return this.transact(['meta'],(s,done)=>{s('meta').put({id,value});done(value);});}
  async createWork(title='未命名作品',sample=false){const work={id:uid(),title:title.trim()||'未命名作品',createdAt:now(),updatedAt:now(),deletedAt:null};const chapter=createDocument(work.id,'chapter',sample?'第一章 · 一封迟到的信':'第一章',sample?'雨停在傍晚六点。\n\n林舟推开旧书店的门时，柜台上多了一封没有邮戳的信。信封上的字迹，和十年前失踪的父亲一模一样。':'');const outline=createDocument(work.id,'outline','故事大纲','');outline.order=chapter.order-1;return this.transact(['works','documents','revisions'],(s,done)=>{s('works').add(work);for(const doc of [chapter,outline]){s('documents').add(doc);s('revisions').add(snapshot(doc,'create'));}done({work,chapter});});}
  async createFromBlueprint(plan){
    if(!plan||typeof plan.title!=='string'||!Array.isArray(plan.documents)||!Array.isArray(plan.tasks)||!plan.documents.length)throw new Error('无法建立这份写作空间。');
    if(plan.documents.some(d=>!['chapter','outline','material'].includes(d.kind)||typeof d.title!=='string'||typeof d.content!=='string'||(d.category!==undefined&&(!Object.hasOwn(CATEGORIES,d.category)||d.kind!=='material')))||plan.tasks.some(t=>typeof t!=='string'||!t.trim()))throw new Error('交付结构无效。');
    const work={id:uid(),title:plan.title,createdAt:now(),updatedAt:now(),deletedAt:null};
    const documents=plan.documents.map((d,index)=>({...createDocument(work.id,d.kind,d.title,d.content),category:d.category||'inbox',order:Date.now()+index}));
    const chapter=documents.find(d=>d.kind==='chapter');if(!chapter)throw new Error('写作空间缺少正文入口。');
    const tasks=plan.tasks.map(text=>({id:uid(),workId:work.id,text,chapterId:chapter.id,done:false,revision:1}));
    return this.transact(['works','documents','revisions','tasks'],(s,done)=>{
      s('works').add(work);for(const d of documents){s('documents').add(d);s('revisions').add(snapshot(d,'setup'));}for(const t of tasks)s('tasks').add(t);done({work,chapter,documents});
    });
  }
  async renameWork(id,title){return this.transact(['works'],(s,done,abort)=>{const r=s('works').get(id);r.onsuccess=()=>{if(!r.result)return abort(new Error('作品不存在。'));const w={...r.result,title:title.trim()||r.result.title,updatedAt:now()};s('works').put(w);done(w);};});}
  async addDocument(workId,kind,title,content='',source=null,category='inbox'){const doc=createDocument(workId,kind,title,content);if(kind==='material'){if(!Object.hasOwn(CATEGORIES,category))throw Error('资料分类无效');doc.category=category;}if(source)doc.sourceId=source.id;return this.transact(['works','documents','revisions','sources'],(s,done,abort)=>{const r=s('works').get(workId);r.onsuccess=()=>{if(!r.result||r.result.deletedAt)return abort(new Error('作品不存在。'));s('documents').add(doc);s('revisions').add(snapshot(doc,'create'));if(source)s('sources').add(source);done(doc);};});}
  async saveDocument(id,expectedRevision,patch,reason='edit'){return this.transact(['documents','revisions'],(s,done,abort)=>{const r=s('documents').get(id);r.onsuccess=()=>{const previous=r.result;if(!previous)return abort(new Error('文档不存在。'));if(previous.revision!==expectedRevision)return abort(new ConflictError(previous));const allowed={};for(const key of ['title','content','category','tags','order','parentId','deletedAt'])if(key in patch)allowed[key]=patch[key];if('category' in allowed&&(!Object.hasOwn(CATEGORIES,allowed.category)||(previous.kind!=='material'&&allowed.category!=='inbox')))return abort(new Error('资料分类无效'));if(typeof allowed.title==='string')allowed.title=allowed.title.trim()||previous.title;const doc={...previous,...allowed,revision:previous.revision+1,updatedAt:now()};s('documents').put(doc);s('revisions').add(snapshot(doc,reason));done(doc);};});}
  async restoreRevision(documentId,expectedRevision,revisionId){const old=await this.get('revisions',revisionId);if(!old||old.documentId!==documentId)throw new Error('找不到这份历史版本。');return this.saveDocument(documentId,expectedRevision,{title:old.title,content:old.content,category:old.category},'restore');}
  async createTask(workId,text,chapterId=null){
    if(!text.trim())throw new Error('请写下一件想完成的事。');
    return this.transact(['works','documents','tasks'],(s,done,abort)=>{
      const work=s('works').get(workId),chapter=chapterId?s('documents').get(chapterId):null;
      let remaining=chapter?2:1;
      const finish=()=>{if(--remaining)return;if(!work.result||work.result.deletedAt)return abort(new Error('作品不存在。'));
        if(chapter&&(!chapter.result||chapter.result.workId!==workId||chapter.result.kind!=='chapter'||chapter.result.deletedAt))return abort(new Error('请选择这部作品中可用的章节。'));
        const task={id:uid(),workId,text:text.trim(),chapterId:chapterId||null,done:false,revision:1};s('tasks').add(task);done(task);
      };work.onsuccess=finish;if(chapter)chapter.onsuccess=finish;
    });
  }
  async setTaskChapter(id,expectedRevision,chapterId=null){
    return this.transact(['tasks','documents'],(s,done,abort)=>{
      const task=s('tasks').get(id),chapter=chapterId?s('documents').get(chapterId):null;let remaining=chapter?2:1;
      const finish=()=>{if(--remaining)return;const old=task.result;if(!old||old.revision!==expectedRevision)return abort(new Error('任务已被其他窗口更新，请刷新列表。'));
        if(chapter&&(!chapter.result||chapter.result.workId!==old.workId||chapter.result.kind!=='chapter'||chapter.result.deletedAt))return abort(new Error('请选择这部作品中可用的章节。'));
        const next={...old,chapterId:chapterId||null,revision:old.revision+1};s('tasks').put(next);done(next);
      };task.onsuccess=finish;if(chapter)chapter.onsuccess=finish;
    });
  }
  async toggleTask(id,expectedRevision,doneState){return this.transact(['tasks'],(s,done,abort)=>{const r=s('tasks').get(id);r.onsuccess=()=>{if(!r.result||r.result.revision!==expectedRevision)return abort(new Error('任务已被其他窗口更新，请刷新列表。'));const next={...r.result,done:doneState,revision:expectedRevision+1};s('tasks').put(next);done(next);};});}
  async link(workId,fromId,toId){return this.transact(['documents','relations'],(s,done,abort)=>{const a=s('documents').get(fromId),b=s('documents').get(toId),all=s('relations').getAll();let count=0;const finish=()=>{if(++count!==3)return;const source=a.result,target=b.result;if(!source||!target||source.deletedAt||target.deletedAt||source.workId!==workId||target.workId!==workId||source.kind!=='material'||target.kind!=='chapter')return abort(new Error('只能关联当前作品的有效资料与章节。'));const found=all.result.find(r=>r.fromId===fromId&&r.toId===toId);if(found)return done(found);const relation={id:uid(),workId,fromId,toId,type:'reference',reason:'作者手动关联',origin:'manual',status:'accepted'};s('relations').add(relation);done(relation);};a.onsuccess=finish;b.onsuccess=finish;all.onsuccess=finish;});}
  async unlink(id){return this.transact(['relations'],s=>s('relations').delete(id));}
  async saveLiveState(id,expectedRevision,syncId,content,update){
    if(typeof syncId!=='string'||!syncId.trim()||typeof content!=='string'||content.length>250000||typeof update!=='string'||update.length>3*1024*1024)throw Error('协作章节超出容量限制，请先拆分章节并导出备份。');
    return this.transact(['documents','revisions','meta'],(s,done,abort)=>{const r=s('documents').get(id);r.onsuccess=()=>{const old=r.result;if(!old||old.kind!=='chapter'||old.deletedAt)return abort(Error('协作章节不存在'));if(old.revision!==expectedRevision)return abort(new ConflictError(old));if(old.syncId&&old.syncId!==syncId)return abort(Error('协作编号不匹配，已停止保存'));const changed=old.content!==content;const next=changed?{...old,content,syncId,revision:old.revision+1,updatedAt:now()}:{...old,syncId};s('documents').put(next);if(changed)s('revisions').add(snapshot(next,'live'));s('meta').put({id:'live:'+syncId,value:{update,content,documentId:id}});done(next);};});
  }
  async pruneHistory(ids,keep){const selected=new Set(ids);return this.transact(['revisions'],(s,done)=>{const r=s('revisions').getAll();r.onsuccess=()=>{const remove=retentionPlan(r.result,keep).filter(x=>selected.has(x.id));for(const row of remove)s('revisions').delete(row.id);done(remove.length);};});}
  async exportBackup(){const data=await this.all();return {format:'novel-workspace-backup',schemaVersion:1,exportedAt:now(),...data,checksum:await digest(JSON.stringify(data))};}
  async restoreBackup(data){await verifyBackup(data);const copy=remapBackup(data);return this.transact(STORES,(s,done)=>{for(const key of STORES)for(const row of copy[key])s(key).add(row);done(copy);});}
}
