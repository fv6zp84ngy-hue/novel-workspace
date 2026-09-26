import * as Y from '../vendor/yjs.mjs';
import {toBase64} from './domain.mjs?v=0.4.0';
const LIMIT=2*1024*1024;
const decode=value=>{if(typeof value!=='string'||value.length>3*1024*1024)throw Error('协作数据超出上限');try{const raw=Uint8Array.from(atob(value),c=>c.charCodeAt(0));if(raw.length>LIMIT)throw Error('协作数据超出上限');return raw;}catch{throw Error('协作数据已损坏');}};
export class MergeText {
  constructor(update=null){this.doc=new Y.Doc();this.text=this.doc.getText('body');if(update)this.apply(update);}
  get content(){return this.text.toString();}
  get update(){return toBase64(Y.encodeStateAsUpdate(this.doc));}
  apply(update){try{Y.applyUpdate(this.doc,decode(update),'remote');}catch{throw Error('协作数据已损坏，未改写正文');}return this.content;}
  replace(value){
    if(typeof value!=='string'||value.length>250000)throw Error('协作章节超过 25 万字符，请拆分章节');
    const before=this.content;if(before===value)return false;
    let start=0;while(start<before.length&&start<value.length&&before[start]===value[start])start++;
    let endOld=before.length,endNew=value.length;while(endOld>start&&endNew>start&&before[endOld-1]===value[endNew-1]){endOld--;endNew--;}
    // Do not cut inside a UTF-16 surrogate pair when replacing emoji.
    if(start>0&&start<before.length&&/^[\uD800-\uDBFF]$/.test(before[start-1])&&/^[\uDC00-\uDFFF]$/.test(before[start]))start--;
    this.doc.transact(()=>{if(endOld>start)this.text.delete(start,endOld-start);if(endNew>start)this.text.insert(start,value.slice(start,endNew));},'local');
    return true;
  }
  missingFrom(remoteUpdate){const remote=new Y.Doc();try{if(remoteUpdate)Y.applyUpdate(remote,decode(remoteUpdate));return Y.encodeStateAsUpdate(this.doc,Y.encodeStateVector(remote)).length>2;}finally{remote.destroy();}}
  destroy(){this.doc.destroy();}
}
export function livePacket(syncId,update){if(!/^[0-9a-f-]{36}$/i.test(syncId))throw Error('协作章节编号无效');decode(update);return {format:'novel-live',version:1,syncId,update};}
export function readLivePacket(value,syncId){if(!value||value.format!=='novel-live'||value.version!==1||value.syncId!==syncId)throw Error('远端协作文件不是这份章节，已停止同步');decode(value.update);return value.update;}
