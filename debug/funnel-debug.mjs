import {readAllEvents,exportEvents,clearEvents,getVariant} from '../src/analytics.mjs?v=0.4.0';

const $=id=>document.getElementById(id);
const STEPS=[['onboarding_view','F0 开始页'],['route_selected','F1 选择路径'],['input_completed','F2 完成输入'],['first_artifact_ready','F3 首次产物'],['first_value_completed','F4 首次价值'],['deep_interaction','F5 深度交互']];
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const formatDuration=value=>value===null?'—':value<1000?`${Math.max(0,Math.round(value))} ms`:`${(value/1000).toFixed(1)} s`;
const eventTime=(events,name)=>events.find(event=>event.event_name===name)?.ts_ms??null;

function sessionSummary(events){
  const sorted=[...events].sort((a,b)=>a.ts_ms-b.ts_ms),first=eventTime(sorted,'onboarding_view'),artifact=eventTime(sorted,'first_artifact_ready'),value=eventTime(sorted,'first_value_completed');
  return {events:sorted,session:sorted[0]?.session_id||'',variant:sorted.find(event=>event.variant)?.variant||'unknown',route:sorted.find(event=>event.route)?.route||'—',first,artifact,value,steps:STEPS.map(([name])=>sorted.some(event=>event.event_name===name))};
}

async function refresh(){
  try{
    const events=await readAllEvents(),groups=new Map();
    for(const event of events){const list=groups.get(event.session_id)||[];list.push(event);groups.set(event.session_id,list);}
    const sessions=[...groups.values()].map(sessionSummary).sort((a,b)=>(b.first||0)-(a.first||0));
    $('current-variant').textContent=getVariant();$('funnel-version').textContent=events[0]?.funnel_version||'0.4.0';$('event-total').textContent=String(events.length);$('session-total').textContent=String(sessions.length);
    $('variant-count').textContent=`${sessions.filter(s=>s.variant==='control').length} / ${sessions.filter(s=>s.variant==='treatment').length}`;
    $('table-wrap').innerHTML=sessions.length?`<table class="funnel-table"><thead><tr><th>会话 ID</th><th>变体</th><th>路径</th>${STEPS.map(([,label])=>`<th>${escape(label)}</th>`).join('')}<th>TTFA</th><th>TTFV</th></tr></thead><tbody>${sessions.map(s=>`<tr><td title="${escape(s.session)}">${escape(s.session.slice(0,8))}…</td><td>${escape(s.variant)}</td><td>${escape(s.route)}</td>${s.steps.map(done=>`<td class="${done?'yes':'no'}">${done?'完成':'—'}</td>`).join('')}<td>${formatDuration(s.first&&s.artifact?s.artifact-s.first:null)}</td><td>${formatDuration(s.first&&s.value?s.value-s.first:null)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty-state">还没有漏斗事件。回到工作台，从“新建故事”开始一轮测试。</div>';
    $('status').textContent=`已读取 ${events.length} 个本地事件，${sessions.length} 个会话。`;
  }catch(error){$('status').textContent=`读取失败：${error.message||'本地事件库不可用'}`;}
}

$('refresh').onclick=refresh;
$('export').onclick=async()=>{try{const count=await exportEvents();$('status').textContent=`已导出 ${count} 个事件。导出文件只含匿名测试事件。`;}catch(error){$('status').textContent=`导出失败：${error.message||'请重试'}`;}};
$('clear').onclick=()=>{$('clear-ack').checked=false;$('confirm-clear').disabled=true;$('clear-dialog').showModal();};
$('clear-ack').onchange=ev=>{$('confirm-clear').disabled=!ev.target.checked;};
$('confirm-clear').onclick=async ev=>{ev.preventDefault();if(!$('clear-ack').checked)return;try{await clearEvents();$('clear-dialog').close();$('status').textContent='本地漏斗事件已清除。';await refresh();}catch(error){$('status').textContent=`清空失败：${error.message||'请重试'}`;}};
window.addEventListener('nw:analytics',()=>void refresh());
void refresh();
