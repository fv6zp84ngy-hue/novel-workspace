import {MergeText,livePacket,readLivePacket} from './live-core.mjs?v=0.3.1';
import {decryptBackup,encryptBackup} from './crypto.mjs?v=0.3.1';
import {Services} from './services.mjs?v=0.3.1';
import {escapeHTML as e} from './domain.mjs?v=0.3.1';
const $=id=>document.getElementById(id);
const base64=value=>btoa(String.fromCharCode(...new TextEncoder().encode(value)));
const stableId=doc=>doc.syncId||doc.id;
function remoteUrl(folder,id){const url=new URL(folder);if(url.protocol!=='https:'||url.search||url.hash||!url.pathname.endsWith('/')||!/^[0-9a-f-]{36}$/i.test(id))throw Error('请填写现有 WebDAV 文件夹的 HTTPS 地址，以 / 结尾');return url.href+id+'.live.json';}
export function liveUI({repo,state,flush,refresh,render,modal,closeModal,guard,notify}){
  let active=null;
  async function open(){
    if(active)throw Error('已有协作章节正在使用');if(!await flush())return;
    const doc=await repo.get('documents',state.docId);if(!doc||doc.kind!=='chapter'||doc.deletedAt)throw Error('请选择一个有效章节');
    const syncId=stableId(doc);
    modal('协作编辑 · '+doc.title,`<p>连接后，此章节在两个设备间约数秒同步并自动合并正文。请先用加密备份把同一作品带到另一台设备；两台设备要填写相同的协作文件夹与解密口令。</p><form id="live-connect"><label>WebDAV 文件夹 HTTPS 地址（以 / 结尾） <span class="field-status">连接时必填</span><input id="live-folder" class="field" type="url" required placeholder="https://你的网盘/小说协作/"></label><label>用户名 <span class="field-status">连接时必填</span><input id="live-user" class="field" autocomplete="off" required></label><label>网盘应用密码 <span class="field-status">连接时必填</span><input id="live-dav-pass" class="field" type="password" autocomplete="off" required></label><label>协作解密口令（至少 12 字符） <span class="field-status">连接时必填</span><input id="live-secret" class="field" type="password" autocomplete="off" minlength="12" required></label><p class="small">每章单独生成一个加密文件。口令只在本次打开期间使用；网盘可见文件大小和修改时间。首次连接会自动保留冲突稿件副本。</p><button id="live-join" class="primary">连接此章节</button></form><p id="live-state" role="status"></p>`);
    $('live-connect').onsubmit=guard(async event=>{
      event.preventDefault();const join=$('live-join'),close=$('modal-close'),dialog=$('modal');join.disabled=true;close.disabled=true;const cancel=ev=>ev.preventDefault();dialog.addEventListener('cancel',cancel);
      try{
        const url=remoteUrl($('live-folder').value.trim(),syncId),authorization='Basic '+base64($('live-user').value+':'+$('live-dav-pass').value),password=$('live-secret').value;
        $('live-dav-pass').value='';$('live-secret').value='';$('live-state').textContent='正在校验远端章节和本地版本…';
        active=new LiveSession({repo,doc,syncId,url,authorization,password,refresh,render,closeModal,notify});
        await active.start();active.show();
      }catch(error){if(active){await active.discard();active=null;}throw error;}
      finally{dialog.removeEventListener('cancel',cancel);if(close.isConnected)close.disabled=false;if(join.isConnected)join.disabled=false;}
    });
  }
  class LiveSession {
    constructor(args){Object.assign(this,args);this.service=new Services();this.merge=null;this.remoteUpdate=null;this.etag=null;this.remoteAbsent=false;this.hadRemote=false;this.closed=false;this.timer=null;this.pollTimer=null;this.inflight=false;this.dirty=false;this.saveFailed=false;this.unmodeledInput=false;this.editVersion=0;this.queue=Promise.resolve();this.composing=false;this.savedRevision=args.doc.revision;this.auth=args.authorization;this.remotePassword=args.password;this.lastState='正在连接';}
    enqueue(task){const run=this.queue.catch(()=>{}).then(task);this.queue=run;return run;}
    credentials(){return {url:this.url,authorization:this.auth};}
    status(message){this.lastState=message;if($('live-state'))$('live-state').textContent=message;}
    async read(conditional=true){const result=await this.service.dav({...this.credentials(),operation:'read',...(conditional&&this.etag?{ifNoneMatch:this.etag}:{})});if(result.unchanged)return false;if(!result.exists){if(this.hadRemote)throw Error('远端章节文件已消失，已停止自动同步；本机文字仍在');this.remoteAbsent=true;this.remoteUpdate=null;return true;}const packet=await decryptBackup(result.envelope,this.remotePassword);this.remoteUpdate=readLivePacket(packet,this.syncId);this.etag=result.etag;this.remoteAbsent=false;this.hadRemote=true;return true;}
    async start(){
      const meta=(await this.repo.get('meta','live:'+this.syncId))?.value;
      if(meta&&meta.documentId!==this.doc.id)throw Error('本机协作编号已绑定另一份章节');
      await this.read(false);
      if(meta?.update){this.merge=new MergeText(meta.update);if(this.doc.content!==meta.content)this.merge.replace(this.doc.content);if(this.remoteUpdate)this.merge.apply(this.remoteUpdate);}
      else if(this.remoteUpdate){this.merge=new MergeText(this.remoteUpdate);if(this.doc.content!==this.merge.content){await this.repo.addDocument(this.doc.workId,'chapter',this.doc.title+' · 接入前本地副本',this.doc.content);this.notify('本地正文与远端不同，已先保存一份独立副本。');}}
      else{this.merge=new MergeText();this.merge.replace(this.doc.content);}
      await this.persist();
      await this.synchronize();
      this.status('多端已同步 · 约每 3 秒检查更新');
      this.schedulePoll();
    }
    async persist(){
      if(this.closed||!this.merge)return;
      try{
        const text=this.merge.content,update=this.merge.update,version=this.editVersion;
        const latest=await this.repo.get('documents',this.doc.id);
        if(!latest||latest.deletedAt)throw Error('章节已移除，协作已暂停');
        if(latest.revision!==this.savedRevision&&latest.content!==text)throw Error('此章节在另一窗口也被修改；请先保留当前文字为副本');
        const saved=await this.repo.saveLiveState(this.doc.id,latest.revision,this.syncId,text,update);
        this.savedRevision=saved.revision;this.dirty=this.editVersion!==version||this.merge.content!==text;this.saveFailed=false;
        this.status(this.dirty?'有新修改，准备加密保存…':this.merge.missingFrom(this.remoteUpdate)?'本机已保存，等待网盘同步':'本机已保存 · 多端已同步');
      }catch(error){this.saveFailed=true;throw error;}
    }
    show(){
      $('modal-body').innerHTML=`<p>章节：${e(this.doc.title)}。关闭后停止同步；下次打开会先取回未上传的本地修改。</p><label for="live-editor">协作正文 <span class="field-status">可随时继续写</span></label><textarea id="live-editor" class="field live-editor" spellcheck="false"></textarea><p id="live-state" role="status"></p><button id="live-sync-now" class="secondary">立即检查同步</button><button id="live-copy" class="quiet">将当前文字存为副本</button><p class="small">正文只在本机加密保存后上传密文。出现网盘错误时可继续写，状态会提示仅本机保存。两个作者同时改同一句话仍需人工检查语义。</p>`;
      const editor=$('live-editor');editor.value=this.merge.content;this.status(this.lastState);
      editor.addEventListener('compositionstart',()=>{this.composing=true;});
      editor.addEventListener('compositionend',()=>{this.composing=false;this.localInput();});
      editor.addEventListener('input',()=>{if(!this.composing)this.localInput();});
      $('live-sync-now').onclick=this.guard(()=>this.enqueue(()=>this.saveThenSync()));
      $('live-copy').onclick=this.guard(async()=>{await this.repo.addDocument(this.doc.workId,'chapter',this.doc.title+' · 协作副本',editor.value);this.notify('已将当前文字存为独立章节。');});
      const originalClose=$('modal-close').onclick;
      const cancel=event=>{event.preventDefault();this.enqueue(()=>this.stopAndClose()).catch(error=>this.error(error));};
      this.cancel=cancel;this.originalClose=originalClose;
      $('modal-close').onclick=this.guard(()=>this.enqueue(()=>this.stopAndClose()));$('modal').addEventListener('cancel',cancel);
      this.beforeUnload=event=>{if(this.dirty){event.preventDefault();event.returnValue='';}};
      window.addEventListener('beforeunload',this.beforeUnload);
      this.onVisible=()=>{if(!document.hidden&&!this.closed){this.schedulePoll();this.enqueue(()=>this.saveThenSync()).catch(error=>this.error(error));}};document.addEventListener('visibilitychange',this.onVisible);
    }
    localInput(){if(this.closed||!this.merge)return;const editor=$('live-editor');if(!editor)return;try{if(this.merge.replace(editor.value)){this.editVersion++;this.dirty=true;this.status('有修改，准备加密保存…');clearTimeout(this.timer);this.timer=setTimeout(()=>this.enqueue(()=>this.saveThenSync()).catch(error=>this.error(error)),700);}this.unmodeledInput=false;}catch(error){this.dirty=true;this.unmodeledInput=true;this.error(error);}}
    updateEditor(){const editor=$('live-editor');if(!editor||this.composing||this.unmodeledInput||editor.value===this.merge.content)return;const start=editor.selectionStart,end=editor.selectionEnd;editor.value=this.merge.content;editor.setSelectionRange(Math.min(start,editor.value.length),Math.min(end,editor.value.length));}
    async synchronize(){
      if(this.closed||this.inflight||this.composing)return;
      this.inflight=true;
      try{
        for(let attempt=0;attempt<3;attempt++){
          const changed=await this.read(true);
          if(changed&&this.remoteUpdate){this.merge.apply(this.remoteUpdate);this.updateEditor();await this.persist();}
          if(!this.remoteAbsent&&!this.merge.missingFrom(this.remoteUpdate)){this.status('本机已保存 · 多端已同步');return;}
          const packet=livePacket(this.syncId,this.merge.update),envelope=await encryptBackup(packet,this.remotePassword),postedUpdate=packet.update;
          try{const response=await this.service.dav({...this.credentials(),operation:'write',etag:this.etag,envelope});this.etag=typeof response.etag==='string'&&response.etag.startsWith('"')?response.etag:null;this.remoteUpdate=postedUpdate;this.remoteAbsent=false;this.hadRemote=true;this.status(this.merge.missingFrom(this.remoteUpdate)?'新修改已保存在本机，等待下一次同步':'本机已保存 · 多端已同步');return;}
          catch(error){if(error.status!==409)throw error;this.etag=null;}
        }
        throw Error('远端持续有新修改，本机内容已保留；稍后手动重试');
      }finally{this.inflight=false;}
    }
    async saveThenSync(){if(this.closed)return;clearTimeout(this.timer);await this.persist();await this.synchronize();}
    schedulePoll(){if(this.closed)return;clearTimeout(this.pollTimer);this.pollTimer=setTimeout(async()=>{if(!this.closed){try{await this.enqueue(()=>this.synchronize());}catch(error){this.error(error);}this.schedulePoll();}},document.hidden?10000:3000);}
    error(error){this.status((this.saveFailed||this.unmodeledInput?'本机保存未完成 · ':'仅本机保存 · ')+(error?.message||'同步失败，请稍后重试'));}
    guard(fn){return async()=>{try{await fn();}catch(error){this.error(error);}};}
    async stopAndClose(){clearTimeout(this.timer);if($('live-editor')&&$('live-editor').value!==this.merge.content)throw Error('编辑区有尚未进入协作模型的文字，请先保存副本或缩短章节');if(this.dirty)await this.persist();this.closed=true;clearTimeout(this.pollTimer);$('modal').removeEventListener('cancel',this.cancel);window.removeEventListener('beforeunload',this.beforeUnload);document.removeEventListener('visibilitychange',this.onVisible);$('modal-close').onclick=this.originalClose;this.auth='';this.remotePassword='';this.merge?.destroy();try{await this.service.forget();}catch{}active=null;this.closeModal();await this.refresh();this.render();}
    async discard(){this.closed=true;clearTimeout(this.timer);clearTimeout(this.pollTimer);this.auth='';this.remotePassword='';this.merge?.destroy();try{await this.service.forget();}catch{}}
  }
  return {open};
}
