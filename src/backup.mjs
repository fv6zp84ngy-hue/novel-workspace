import {decryptBackup} from './crypto.mjs?v=0.3.1';
import {escapeHTML as e,verifyBackup} from './domain.mjs?v=0.3.1';

export function backupUI({repo,state,flush,modal,closeModal,refresh,chooseDoc,remember,render,guard,notify,track,download,trashModal,exportEncrypted}) {
  const $=id=>document.getElementById(id);
  async function open(){
    if(!await flush())return;
    modal('备份与恢复',`<p class="muted">内容仅保存在当前浏览器。完整备份包含正文、资料、历史版本和关联，恢复时创建新作品副本。</p>
      <div id="storage-health" class="notice-inline" role="status">正在检查本机存储…</div>
      <div class="setting-row"><p>完整备份<br><small class="muted">使用当前资料库密码加密，请记住密码。</small></p><button id="backup-export" class="primary">导出完整备份</button></div>
      <p id="backup-receipt" class="small muted"></p>
      <div class="setting-row"><div><label for="backup-file">选择备份文件 <span class="field-status">恢复时必选</span></label><p class="small muted">JSON，最大 56 MiB；不会覆盖现有作品。</p><input id="backup-file" type="file" accept=".json,application/json"></div></div>
      <label>备份的解密密码（加密备份必填；旧版明文可留空）<input id="backup-password" class="field" type="password" autocomplete="off"></label><div id="restore-preview" aria-live="polite"></div>
      <div class="setting-row"><p>找回移除的章节和资料</p><button id="backup-trash" class="secondary">打开回收站</button></div>
      `);
    const input=$('backup-file'),preview=$('restore-preview'),receipt=$('backup-receipt'),health=$('storage-health'),dialog=$('modal');
    const alive=()=>dialog.open&&input.isConnected;
    let selection=0;
    const showError=error=>{if(alive())$('modal-error').textContent=error.message||'操作未完成，请重试。';};
    $('backup-export').onclick=async ev=>{
      const button=ev.currentTarget;button.disabled=true;
      try{await exportEncrypted();track('backup_exported');
        if(alive())receipt.textContent='已交给浏览器下载。请确认文件已保存在电脑上；这里无法确认下载是否完成。';
      }catch(err){showError(err);}finally{if(button.isConnected)button.disabled=false;}
    };
    $('backup-trash').onclick=guard(trashModal);
    input.onchange=async()=>{
      const request=++selection;preview.innerHTML='';$('modal-error').textContent='';const file=input.files[0];if(!file)return;
      const current=()=>alive()&&request===selection;
      try{
        if(file.size>56*1024*1024)throw new Error('备份超过 56 MiB，本版暂不支持恢复这么大的文件。');
        preview.textContent='正在读取并校验备份…';let data;
        try{data=JSON.parse(await file.text());}catch{throw new Error('无法读取这份 JSON 备份。');}
        if(data?.format==='novel-encrypted'){const password=$('backup-password').value;$('backup-password').value='';data=await decryptBackup(data,password);}await verifyBackup(data);if(!current())return;
        preview.innerHTML=`<div class="notice-inline"><strong>${e(file.name)}</strong><p>校验通过：${data.works.length} 部作品、${data.documents.length} 份内容、${data.revisions.length} 个版本。</p><p class="small">${e(data.works.map(w=>w.title).join('、')||'空备份')}</p></div><button id="restore-confirm" class="primary">恢复为新作品副本</button>`;
        $('restore-confirm').onclick=async ev=>{
          if(!current())return;const button=ev.currentTarget,close=$('modal-close');button.disabled=true;input.disabled=true;close.disabled=true;
          const preventCancel=event=>event.preventDefault();dialog.addEventListener('cancel',preventCancel);
          try{const result=await repo.restoreBackup(data);await refresh();state.workId=result.works[0]?.id||state.workId;state.docId=null;state.page='write';chooseDoc();await remember();closeModal();render();notify('已恢复为副本，原有作品保持不变。');track('backup_restored');}
          catch(err){showError(err);button.disabled=false;}
          finally{input.disabled=false;close.disabled=false;dialog.removeEventListener('cancel',preventCancel);}
        };
      }catch(err){if(current()){preview.innerHTML='';showError(err);}}
    };
    try{
      const estimate=await navigator.storage?.estimate?.();if(!alive())return;
      if(estimate&&Number.isFinite(estimate.usage)&&Number.isFinite(estimate.quota)&&estimate.quota>0){
        const percent=estimate.usage/estimate.quota*100;
        health.textContent=`此网站存储约 ${(estimate.usage/1048576).toFixed(1)} MiB，占浏览器当前配额 ${percent.toFixed(1)}%。${percent>=80?'空间接近上限，请尽快导出备份。':'请定期导出备份。'} 此估算包含同地址的测试区；浏览器配额会变化，本机保存不等于云备份。`;
      }else health.textContent='浏览器未提供可用的空间估算。内容仍只保存在此浏览器，请定期导出备份。';
    }catch{if(alive())health.textContent='暂时无法读取空间估算。你仍可导出备份；不要清除网站数据。';}
  }
  return {open};
}
