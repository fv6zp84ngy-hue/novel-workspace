import {getSessionId,readAllEvents,track as recordEvent} from './analytics.mjs?v=0.4.0';

const DERIVED = new Set(['first_value_completed','deep_interaction']);
const CORE_ACTIONS = new Set(['edit_saved','material_captured','search_result_opened','material_linked']);
let activeSession = null;
let state = null;
const seen = new Set();

export function createFunnelState(sessionId) {
  return {sessionId,route:null,artifact:false,edited:false,captured:false,imported:false,openedSearchResult:false,linked:false,coreActions:new Set(),firstValueSent:false,deepSent:false};
}

export function applyFunnelEvent(s,event) {
  if(!event||!s||event.session_id!==s.sessionId||DERIVED.has(event.event_name))return s;
  if(event.route==='new_story'||event.route==='migrate_existing')s.route=event.route;
  switch(event.event_name){
    case 'route_selected':s.route=event.route;break;
    case 'first_artifact_ready':s.artifact=true;break;
    case 'edit_saved':if(event.props?.save_state!=='failed')s.edited=true;break;
    case 'material_captured':s.captured=true;break;
    case 'import_succeeded':
    case 'paste_saved':s.imported=true;break;
    case 'search_result_opened':s.openedSearchResult=true;break;
    case 'material_linked':s.linked=true;break;
  }
  if(CORE_ACTIONS.has(event.event_name))s.coreActions.add(event.event_name);
  return s;
}

export function claimDerivedEvents(s) {
  const claimed=[];
  const newStoryValue=s.route==='new_story'&&s.artifact&&(s.edited||s.captured);
  const migrateValue=s.route==='migrate_existing'&&s.artifact&&s.imported&&(s.openedSearchResult||s.linked);
  if(!s.firstValueSent&&(newStoryValue||migrateValue)){
    s.firstValueSent=true;
    claimed.push('first_value_completed');
  }
  if(!s.deepSent&&s.coreActions.size>=3){
    s.deepSent=true;
    claimed.push('deep_interaction');
  }
  return claimed;
}

export function replayFunnelState(events,sessionId) {
  const replayed=createFunnelState(sessionId);
  for(const event of [...events].sort((a,b)=>a.ts_ms-b.ts_ms)){
    if(event.session_id!==sessionId)continue;
    if(event.event_name==='first_value_completed')replayed.firstValueSent=true;
    else if(event.event_name==='deep_interaction')replayed.deepSent=true;
    else applyFunnelEvent(replayed,event);
  }
  return replayed;
}

async function derive(s) {
  for(const name of claimDerivedEvents(s)){
    await recordEvent(name,{route:s.route},{result:'success'});
  }
}

function update(event) {
  if(!event||!event.id||seen.has(event.id))return null;
  seen.add(event.id);
  if(event.session_id!==activeSession||DERIVED.has(event.event_name))return null;
  return applyFunnelEvent(state,event);
}

export async function initFunnel(){
  activeSession=getSessionId();
  const events=await readAllEvents();
  state=replayFunnelState(events,activeSession);
  for(const event of events)if(event.session_id===activeSession)seen.add(event.id);
  window.addEventListener('nw:analytics',ev=>{
    const current=update(ev.detail);
    if(current)void derive(current).catch(()=>{});
  });
  await derive(state);
  return state;
}

export function currentFunnelState(){
  if(!state)return null;
  return {...state,coreActions:[...state.coreActions]};
}
