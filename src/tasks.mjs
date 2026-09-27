import {escapeHTML as e} from './domain.mjs?v=0.4.0';

export function tasksUI({repo,state,docs,currentWork,refresh,navigate,modal,closeModal,guard,notify,track=()=>{}}) {
  const $=id=>document.getElementById(id);
  const options=selected=>'<option value="">暂不关联章节</option>'+docs().filter(d=>d.kind==='chapter').map(d=>`<option value="${d.id}" ${d.id===selected?'selected':''}>${e(d.title)}</option>`).join('');
  function render(){
    const items=state.tasks.filter(t=>t.workId===state.workId);
    $('stage').innerHTML=`<div class="stage-heading"><div><p class="eyebrow">${e(currentWork().title)} / 创作任务</p><h1>把大故事，拆成小进展。</h1></div><span class="badge">${items.filter(t=>t.done).length} / ${items.length} 已完成</span></div>
      <section class="content-panel"><form id="task-form"><label for="task-text">下一件想完成的事 <span class="field-status">必填</span></label><input id="task-text" class="field" maxlength="160" required placeholder="例如：写下主角第一次出场的三句话"><label for="task-chapter">关联章节 <span class="field-status">选填</span></label><select id="task-chapter" class="field">${options(null)}</select><button class="primary">添加任务</button></form>
      <ul class="task-list">${items.map(t=>{const chapter=state.documents.find(d=>d.id===t.chapterId);return `<li><label class="${t.done?'done':''}"><input type="checkbox" data-task="${t.id}" ${t.done?'checked':''}><span>${e(t.text)}</span></label><div class="task-context">${chapter&&!chapter.deletedAt?`<button class="quiet" data-task-open="${chapter.id}">打开章节：${e(chapter.title)}</button>`:t.chapterId?'<span class="small muted">关联章节已移到回收站，找回后可继续打开。</span>':'<span class="small muted">未关联章节</span>'}<button class="quiet" data-task-link="${t.id}">${t.chapterId?'调整关联':'关联章节'}</button></div></li>`;}).join('')||'<li class="muted">先记下一件小事，完成后回来勾选。</li>'}</ul></section>`;
    $('task-form').onsubmit=guard(async ev=>{ev.preventDefault();const text=$('task-text').value.trim();if(!text)return;const submit=ev.submitter;submit.disabled=true;try{await repo.createTask(state.workId,text,$('task-chapter').value||null);await refresh();render();track('task_created');notify('已记下这件事。');}finally{if(submit.isConnected)submit.disabled=false;}});
    document.querySelectorAll('[data-task]').forEach(c=>c.onchange=guard(async()=>{const t=items.find(x=>x.id===c.dataset.task);try{await repo.toggleTask(t.id,t.revision,c.checked);if(c.checked)track('task_completed');}finally{await refresh();render();}}));
    document.querySelectorAll('[data-task-open]').forEach(b=>b.onclick=guard(async()=>{await refresh();if(!docs().some(d=>d.id===b.dataset.taskOpen)){render();notify('这一章已被移除，可去回收站找回。');return;}await navigate('write',b.dataset.taskOpen);}));
    document.querySelectorAll('[data-task-link]').forEach(b=>b.onclick=guard(async()=>{
      await refresh();const task=state.tasks.find(t=>t.id===b.dataset.taskLink);if(!task)throw new Error('任务已不存在。');
      modal('这件事属于哪一章',`<p>${e(task.text)}</p><form id="task-link-form"><label for="task-link-select">关联章节 <span class="field-status">选填</span></label><select id="task-link-select" class="field">${options(task.chapterId)}</select><p class="small muted">选择“暂不关联章节”即可取消关联。不会修改章节正文。</p><button class="primary">保存关联</button></form>`);
      $('task-link-form').onsubmit=guard(async ev=>{ev.preventDefault();await repo.setTaskChapter(task.id,task.revision,$('task-link-select').value||null);await refresh();closeModal();render();notify('章节关联已更新。');});
    }));
  }
  return {render};
}
