import {FUNNEL_VERSION,getSessionId,readAllEvents,track as recordEvent} from './analytics.mjs?v=0.4.1';

const DERIVED = new Set(['first_value_completed','deep_interaction']);
const CORE_ACTIONS = new Set(['edit_saved','material_captured','search_result_opened','material_linked']);
const USER_SOURCES = new Set(['editor','library','search','assistant']);
let activeSession = null;
let state = null;
let queue = Promise.resolve();
const seen = new Set();

// Missing/unknown sources fail closed: legacy events cannot prove user intent.
export function is_user_action(event) {
  return CORE_ACTIONS.has(event?.event_name) && USER_SOURCES.has(event.props?.source)
    && event.props?.result !== 'failure' && event.props?.save_state !== 'failed'
    && (event.event_name !== 'edit_saved' || event.props?.save_state === 'saved');
}

export function createFunnelState(sessionId) {
  return {sessionId,route:null,artifact:false,edited:false,captured:false,imported:false,openedSearchResult:false,linked:false,coreActions:new Set(),firstValueSent:false,deepSent:false};
}

export function applyFunnelEvent(s,event) {
  if(!event||!s||event.session_id!==s.sessionId||event.funnel_version!==FUNNEL_VERSION||DERIVED.has(event.event_name))return s;
  // Route changes before delivery are allowed; subsequent library actions inherit the delivered route.
  if(!s.artifact&&!s.imported&&(event.route==='new_story'||event.route==='migrate_existing'))s.route=event.route;
  if(event.event_name==='first_artifact_ready')s.artifact=true;
  if(['import_succeeded','paste_saved'].includes(event.event_name)&&event.props?.result!=='failure')s.imported=true;
  if(!is_user_action(event))return s;
  s.coreActions.add(event.event_name);
  // Earlier actions cannot qualify retroactively when an artifact/import arrives.
  if(s.artifact&&event.event_name==='edit_saved')s.edited=true;
  if(s.artifact&&event.event_name==='material_captured')s.captured=true;
  if(s.imported&&event.event_name==='search_result_opened')s.openedSearchResult=true;
  if(s.imported&&event.event_name==='material_linked')s.linked=true;
  return s;
}

export function claimDerivedEvents(s) {
  const claimed=[];
  const newStoryValue=s.route==='new_story'&&s.artifact&&(s.edited||s.captured);
  const migrateValue=s.route==='migrate_existing'&&s.imported&&(s.openedSearchResult||s.linked);
  if(!s.firstValueSent&&(newStoryValue||migrateValue)){s.firstValueSent=true;claimed.push('first_value_completed');}
  if(!s.deepSent&&s.coreActions.size>=3){s.deepSent=true;claimed.push('deep_interaction');}
  return claimed;
}

export function replayFunnelState(events,sessionId) {
  const replayed=createFunnelState(sessionId);
  for(const event of [...events].sort((a,b)=>a.ts_ms-b.ts_ms)){
    if(event.session_id!==sessionId||event.funnel_version!==FUNNEL_VERSION)continue;
    if(event.event_name==='first_value_completed')replayed.firstValueSent=true;
    else if(event.event_name==='deep_interaction')replayed.deepSent=true;
    else applyFunnelEvent(replayed,event);
  }
  return replayed;
}

async function derive(s) {
  const claims=claimDerivedEvents(s);
  for(const name of claims){
    try{
      if(getSessionId()!==s.sessionId)throw Error('Measurement session changed');
      await recordEvent(name,{route:s.route},{source:'onboarding',result:'success'});
    }catch{
      s[name==='first_value_completed'?'firstValueSent':'deepSent']=false;
    }
  }
}

function update(event) {
  if(!event||!event.id||seen.has(event.id)||event.funnel_version!==FUNNEL_VERSION)return null;
  seen.add(event.id);
  if(DERIVED.has(event.event_name)||event.session_id!==getSessionId())return null;
  if(event.session_id!==activeSession){activeSession=event.session_id;state=createFunnelState(activeSession);}
  return applyFunnelEvent(state,event);
}

export async function initFunnel(){
  activeSession=getSessionId();
  const events=await readAllEvents();
  state=replayFunnelState(events,activeSession);
  for(const event of events)if(event.session_id===activeSession)seen.add(event.id);
  window.addEventListener('nw:analytics',ev=>{
    queue=queue.then(async()=>{const current=update(ev.detail);if(current)await derive(current);}).catch(()=>{});
  });
  await derive(state);
  return state;
}

export function currentFunnelState(){return state?{...state,coreActions:[...state.coreActions]}:null;}
