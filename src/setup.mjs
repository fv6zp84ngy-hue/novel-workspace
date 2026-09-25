import {escapeHTML as e} from './domain.mjs?v=0.3.1';
import {SCENARIOS,makeBlueprint} from './blueprint.mjs?v=0.3.1';

export function setupUI({repo,state,flush,refresh,remember,render,modal,closeModal,guard,notify,blankWorkModal}) {
  const $=id=>document.getElementById(id);
  let route='new',language='zh',scenario='starter',intent='',material='',busy=false;
  const t=(zh,en)=>language==='en'?en:zh;
  const capture=()=>{intent=$('entry-intent')?.value??intent;material=$('entry-material')?.value??material;};
  async function open(){if(!await flush())return;route='new';scenario='starter';intent='';material='';draw();}
  function draw(){
    $('app').innerHTML=`<main class="welcome setup"><div class="setup-top"><p class="eyebrow">NOVEL WORKSPACE · 未完待续</p><label>${t('入口语言','Entry language')}<select id="entry-language"><option value="zh" ${language==='zh'?'selected':''}>中文</option><option value="en" ${language==='en'?'selected':''}>English</option></select></label></div>
      <h1>${t('让散落的想法，长成一个故事。','A home for your story and scattered notes.')}</h1><p>${t('把大纲、人物和资料放在一起。先整理一个能继续写下去的空间。','Keep your outline, characters and references together, ready to write.')}</p>
      <div class="route-switch"><button data-route="new" class="${route==='new'?'primary':'secondary'}" aria-pressed="${route==='new'}">${t('我想开始新故事','Start a new story')}</button><button data-route="migrate" class="${route==='migrate'?'primary':'secondary'}" aria-pressed="${route==='migrate'}">${t('我已经有一些稿件','Bring existing notes')}</button></div>
      <p class="small muted">${t('创作方向（选填）：点一个获得示例，也可以直接在下面写一句话。','Direction (optional): choose a prompt or write your own sentence below.')}</p><div class="scenario-rows">${[SCENARIOS.slice(0,4),SCENARIOS.slice(4)].map(row=>`<div class="scenario-row">${row.map(s=>`<button class="scenario-chip" data-scenario="${s.id}" aria-pressed="${s.id===scenario}">${e(language==='en'?s.en:s.label)}</button>`).join('')}</div>`).join('')}</div>
      <form id="setup-form" class="setup-form"><label for="entry-intent">${t('一句话说想写什么','What would you like to write?')} <span class="field-status">${t('选填','Optional')}</span></label><textarea id="entry-intent" class="field area" maxlength="2000" placeholder="${t('例如：主角收到一封十年前寄来的信……；还没想好也能继续','For example: a letter arrives ten years late… You can continue without an idea.')}">${e(intent)}</textarea>
      ${route==='migrate'?`<label for="entry-material">${t('粘贴已有稿件','Paste existing notes')} <span class="field-status">${t('选填','Optional')}</span></label><textarea id="entry-material" class="field area" placeholder="${t('现在可先留空，进入后再导入 TXT / Markdown 文件。','Leave blank and import TXT / Markdown later.')}">${e(material)}</textarea>`:''}
      <p class="small muted">${t('使用本地模板准备结构，保留你的原话。没有调用 AI，稿件不会上传。','Local templates preserve your words. No AI call or manuscript upload. The writing workspace uses Chinese navigation.')}</p><div class="actions"><button class="primary">${t('预览我的写作空间','Preview my workspace')}</button><button id="skip-setup" type="button" class="quiet">${t('创建空白作品','Create a blank story')}</button></div><p id="entry-error" class="danger" role="alert"></p></form>
      ${state.workId?`<button id="return-work" class="quiet">${t('回到我的作品','Back to my story')}</button>`:''}</main>`;
    document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>{capture();route=b.dataset.route;draw();});
    $('entry-language').onchange=ev=>{capture();language=ev.target.value;draw();};
    document.querySelectorAll('[data-scenario]').forEach(b=>b.onclick=()=>{capture();const old=SCENARIOS.find(x=>x.id===scenario),oldExample=language==='en'?`I want a writing space for ${old.en.toLowerCase()}, with an outline and a first chapter.`:old.example;const replaceExample=!intent.trim()||intent===oldExample;scenario=b.dataset.scenario;const s=SCENARIOS.find(x=>x.id===scenario);if(replaceExample)intent=language==='en'?`I want a writing space for ${s.en.toLowerCase()}, with an outline and a first chapter.`:s.example;if(scenario==='migration')route='migrate';draw();$('entry-intent').focus();});
    $('skip-setup').onclick=guard(blankWorkModal);if($('return-work'))$('return-work').onclick=render;
    $('setup-form').onsubmit=ev=>{ev.preventDefault();if(busy)return;capture();try{preview(makeBlueprint({intent,route,scenario,language,material}));}catch(err){$('entry-error').textContent=err.message;}};
  }
  function preview(plan){
    modal(t('准备开始你的故事','Ready to start your story'),`<p class="badge">${t('本地模板 · 尚未创建','Local template · not created yet')}</p><label for="delivery-title">${t('作品名称','Story title')} <span class="field-status">${t('选填','Optional')}</span></label><input id="delivery-title" class="field" maxlength="80" value="${e(plan.title)}"><p class="small muted">${t('留空会使用预览中的名称，以后也能改。','Leave blank to keep the suggested title; you can rename it later.')}</p><ul>${plan.documents.map(d=>`<li>${e(d.title)}</li>`).join('')}</ul><details><summary>${t('查看大纲','Preview outline')}</summary><pre class="preview-text">${e(plan.documents[0].content)}</pre></details><p>${t('还会准备两项创作任务。创建后可继续编辑。','Two writing tasks are included. Everything remains editable.')}</p><button id="deliver-now" class="primary full">${t('创建并开始写作','Create and start writing')}</button>`);
    $('deliver-now').onclick=async ev=>{
      if(busy)return;busy=true;const button=ev.currentTarget,close=$('modal-close');button.disabled=true;close.disabled=true;const cancel=e=>e.preventDefault();$('modal').addEventListener('cancel',cancel);
      try{plan.title=$('delivery-title').value.trim()||plan.title;const result=await repo.createFromBlueprint(plan);state.workId=result.work.id;state.docId=result.chapter.id;state.page=route==='migrate'?'library':'write';await refresh();await remember();closeModal();render();notify(t('空间已保存。可以开始写作，也可以先找回资料。','Your workspace is saved. Start writing or find a note.'));}
      catch(err){$('modal-error').textContent=err.message;button.disabled=false;}
      finally{busy=false;close.disabled=false;$('modal').removeEventListener('cancel',cancel);}
    };
  }
  return {open};
}
