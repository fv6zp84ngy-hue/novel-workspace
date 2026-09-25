import {Repository} from './storage.mjs?v=0.4.0';
import {STORES,ConflictError,digest,now} from './domain.mjs?v=0.4.0';
import {deriveVaultKey,seal,unseal,inspectEnvelope,randomBytes} from './crypto.mjs?v=0.4.0';
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const empty=()=>Object.fromEntries(STORES.map(s=>[s,[]]));
export class VaultRepository extends Repository {
  constructor(name){super(name);this.key=null;this.salt=null;this.data=null;this.epoch=0;this.tail=Promise.resolve();}
  async open(){this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open(this.name,2);r.onupgradeneeded=()=>{for(const name of STORES)if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'id'});};r.onblocked=()=>reject(Error('请先关闭其他打开本作品库的窗口。'));r.onerror=()=>reject(r.error);r.onsuccess=()=>{r.result.onversionchange=()=>this.close();resolve(r.result);};});this.encrypted=!!await this.raw();this.legacy=!this.encrypted&&(await super.list("works")).length>0;return this;}
  raw(){return request(this.db.transaction('meta').objectStore('meta').get('encrypted-vault'));}
  async unlock(password){const raw=await this.raw();if(!raw)throw Error('请先设置资料库密码');const {salt}=inspectEnvelope(raw.envelope);const key=await deriveVaultKey(password,salt),data=await unseal(raw.envelope,key);this.checkData(data);this.key=key;this.salt=salt;this.data=data;this.epoch=raw.epoch;}
  checkData(data){if(!data||STORES.some(s=>!Array.isArray(data[s])))throw Error('加密资料库结构错误');}
  async legacyBackup(){if(await this.raw())throw Error('资料库已加密，请解锁后导出');const data=await super.all();return {format:'novel-workspace-backup',schemaVersion:1,exportedAt:now(),...data,checksum:await digest(JSON.stringify(data))};}
  async initialize(password){if(await this.raw())throw Error('此资料库已有密码，请刷新后解锁');const data=await super.all(),salt=randomBytes(16),key=await deriveVaultKey(password,salt);const envelope=await seal(data,key,salt);await this.commit(envelope,0,true);this.key=key;this.salt=salt;this.data=data;this.epoch=1;this.encrypted=true;}
  lock(){this.key=null;this.salt=null;this.data=null;}
  close(){this.lock();super.close();}
  async load(){if(!this.key)throw Error('资料库已锁定，请先解锁');const row=await this.raw();if(!row)throw Error('找不到加密资料库');if(row.epoch!==this.epoch||!this.data){const data=await unseal(row.envelope,this.key);this.checkData(data);this.data=data;this.epoch=row.epoch;}return this.data;}
  async list(name){await this.tail;return structuredClone((await this.load())[name]);}
  async get(name,id){return (await this.list(name)).find(row=>row.id===id);}
  async all(){await this.tail;return structuredClone(await this.load());}
  commit(envelope,expected,migrate=false){return new Promise((resolve,reject)=>{const tx=this.db.transaction(STORES,'readwrite');let error;tx.oncomplete=()=>{this.channel?.postMessage({changed:true});resolve();};tx.onabort=()=>reject(error||tx.error||Error('加密保存未完成'));tx.onerror=()=>{};const r=tx.objectStore('meta').get('encrypted-vault');r.onsuccess=()=>{if((r.result?.epoch||0)!==expected){error=new ConflictError();tx.abort();return;}if(migrate)for(const s of STORES)tx.objectStore(s).clear();tx.objectStore('meta').put({id:'encrypted-vault',epoch:expected+1,envelope});};});}
  transact(keys,action){
    const run=async()=>{const next=structuredClone(await this.load()),expected=this.epoch;let value,error;
      // Existing repository operations use asynchronous IDB-shaped requests. Execute on a
      // private snapshot, then encrypt and atomically compare-and-swap the entire vault.
      await new Promise((resolve,reject)=>{let pending=0,scheduled=false;
        const finish=()=>{if(!pending&&!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;if(pending)return;error?reject(error):resolve();});}};
        const req=fn=>{pending++;const result={};queueMicrotask(()=>{try{if(!error){result.result=fn();result.onsuccess?.();}}catch(e){error=e;}finally{pending--;finish();}});return result;};
        const store=name=>{if(!keys.includes(name))throw Error('事务范围错误');return {get:id=>req(()=>structuredClone(next[name].find(r=>r.id===id))),getAll:()=>req(()=>structuredClone(next[name])),add:row=>req(()=>{if(next[name].some(r=>r.id===row.id))throw Error('重复编号');next[name].push(structuredClone(row));}),put:row=>req(()=>{const i=next[name].findIndex(r=>r.id===row.id);if(i<0)next[name].push(structuredClone(row));else next[name][i]=structuredClone(row);}),delete:id=>req(()=>{next[name]=next[name].filter(r=>r.id!==id);}),clear:()=>req(()=>{next[name]=[];})};};
        try{action(store,v=>value=v,e=>{error=e;});}catch(e){error=e;}finish();
      });
      const envelope=await seal(next,this.key,this.salt);await this.commit(envelope,expected);this.data=next;this.epoch=expected+1;return value;
    };
    const pending=this.tail.then(run);this.tail=pending.catch(()=>{});return pending;
  }
}
