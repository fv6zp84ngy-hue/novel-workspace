import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {bucketCount,bucketLength,getSessionId,getVariant,sanitizeProps,FUNNEL_VERSION,startFunnelSession} from '../src/analytics.mjs?v=0.4.1';
import {applyFunnelEvent,claimDerivedEvents,createFunnelState,replayFunnelState,is_user_action} from '../src/funnel.mjs?v=0.4.1';
import {makeBlueprint} from '../src/blueprint.mjs?v=0.4.0';

function event(session,event_name,{route=null,props={}}={}){
  return {id:crypto.randomUUID(),session_id:session,event_name,route,props:{source:'library',...props},funnel_version:FUNNEL_VERSION,ts_ms:Date.now()};
}
function send(state,name,options={}){
  applyFunnelEvent(state,event(state.sessionId,name,options));
  return claimDerivedEvents(state);
}

test('analytics props accept bounded enums and values, rejecting manuscript and credential strings',()=>{
  const clean=sanitizeProps({
    source:'onboarding',result:'success',input_length_bucket:'51_200',ai_configured:true,character_count:128,
    prompt:'SECRET_STORY_123',content:'SECRET_STORY_123',text:'SECRET_STORY_123',title:'private title',api_key:'sk-private',
    reason:'SECRET_STORY_123',source_path:'/'+'Users/private/story.txt',import_format:'/'+'Users/private/story.txt'
  });
  assert.deepEqual(clean,{source:'onboarding',result:'success',input_length_bucket:'51_200',ai_configured:true,character_count:128});
  assert.equal(bucketLength(0),'0');assert.equal(bucketLength(50),'1_50');assert.equal(bucketLength(51),'51_200');assert.equal(bucketLength(201),'201_2000');
  assert.equal(bucketCount(0),'0');assert.equal(bucketCount(1),'1');assert.equal(bucketCount(4),'2_5');assert.equal(bucketCount(9),'6_plus');
});

test('session id remains stable for one tab and URL experiment variant wins',()=>{
  const oldStorage=globalThis.sessionStorage,oldLocation=globalThis.location,oldCrypto=globalThis.crypto;
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value))};
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:storage});
  Object.defineProperty(globalThis,'location',{configurable:true,value:{search:'?onboarding=control'}});
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
  try{
    const first=getSessionId();assert.equal(getSessionId(),first);assert.equal(getVariant(),'control');
    Object.defineProperty(globalThis,'location',{configurable:true,value:{search:'?onboarding=treatment'}});
    assert.equal(getVariant(),'treatment');assert.notEqual(getSessionId(),first);const second=getSessionId();assert.equal(getSessionId(),second);assert.notEqual(startFunnelSession(),second);
    const secondValues=new Map(),secondStorage={getItem:key=>secondValues.get(key)||null,setItem:(key,value)=>secondValues.set(key,String(value))};
    Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:secondStorage});
    assert.notEqual(getSessionId(),first);
  }finally{
    if(oldStorage===undefined)delete globalThis.sessionStorage;else Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:oldStorage});
    if(oldLocation===undefined)delete globalThis.location;else Object.defineProperty(globalThis,'location',{configurable:true,value:oldLocation});
    if(oldCrypto===undefined)delete globalThis.crypto;else Object.defineProperty(globalThis,'crypto',{configurable:true,value:oldCrypto});
  }
});

test('new story value requires artifact plus a saved edit or captured idea, and emits once',()=>{
  const s=createFunnelState('new-session');
  assert.deepEqual(send(s,'route_selected',{route:'new_story'}),[]);
  assert.deepEqual(send(s,'first_artifact_ready',{route:'new_story'}),[]);
  assert.deepEqual(send(s,'edit_saved',{props:{save_state:'saved'}}),['first_value_completed']);
  assert.deepEqual(send(s,'edit_saved',{props:{save_state:'saved'}}),[]);
  assert.equal(s.firstValueSent,true);
});

test('migration value waits for imported material and a successful find or link',()=>{
  const s=createFunnelState('migration-session');
  send(s,'route_selected',{route:'migrate_existing'});
  send(s,'paste_saved',{route:'migrate_existing'});
  assert.deepEqual(send(s,'first_artifact_ready',{route:'migrate_existing'}),[]);
  assert.deepEqual(send(s,'search_started'),[]);
  assert.deepEqual(send(s,'search_result_opened'),['first_value_completed']);
  assert.deepEqual(send(s,'material_linked'),[]);
});

test('three distinct core actions derive deep interaction once',()=>{
  const s=createFunnelState('deep-session');
  send(s,'edit_saved',{props:{save_state:'saved'}});
  send(s,'material_captured');
  assert.deepEqual(send(s,'material_captured'),[]);
  assert.deepEqual(send(s,'material_linked'),['deep_interaction']);
  assert.deepEqual(send(s,'search_result_opened'),[]);
});

test('replay preserves sent derived events and does not emit them again after reload',()=>{
  const sid='reload-session',events=[
    event(sid,'route_selected',{route:'new_story'}),event(sid,'first_artifact_ready',{route:'new_story'}),
    event(sid,'material_captured'),event(sid,'first_value_completed',{route:'new_story'})
  ];
  const restored=replayFunnelState(events,sid);
  assert.equal(restored.firstValueSent,true);assert.deepEqual(claimDerivedEvents(restored),[]);
  assert.equal(replayFunnelState(events,'another-session').artifact,false);
});

test('local natural-language fallback keeps the original idea in an editable starting-point card without AI',()=>{
  const raw='  一位邮差在每封信里发现了同一天的日期。\n不要改写原句。  ';
  const plan=makeBlueprint({intent:raw,route:'new'});
  const startingPoint=plan.documents.find(doc=>doc.title==='创作起点');
  assert.ok(startingPoint);assert.equal(startingPoint.content,raw);assert.equal(startingPoint.category,'inspiration');
  assert.equal(plan.hasCapturedIntent,true);assert.ok(plan.documents.some(doc=>doc.kind==='chapter'));
});


test('Case A auto capture never activates; Case B later saved title/edit does',()=>{
  const s=createFunnelState('cases');
  send(s,'first_artifact_ready',{route:'new_story',props:{source:'onboarding'}});
  assert.deepEqual(send(s,'material_captured',{props:{source:'onboarding'}}),[]);
  assert.equal(s.artifact,true);assert.equal(s.firstValueSent,false);assert.equal(s.coreActions.size,0);
  assert.deepEqual(send(s,'edit_saved',{props:{source:'editor',save_state:'saved'}}),['first_value_completed']);
});

test('automatic, unknown-source and failed actions cannot contribute to deep interaction',()=>{
  const s=createFunnelState('sources');
  for(const name of ['edit_saved','material_captured','search_result_opened','material_linked']){
    send(s,name,{props:{source:'onboarding',save_state:'saved'}});
    send(s,name,{props:{source:null,save_state:'saved'}});
    send(s,name,{props:{result:'failure',save_state:'saved'}});
  }
  send(s,'edit_saved',{props:{save_state:'failed'}});
  assert.equal(s.coreActions.size,0);assert.equal(s.deepSent,false);
  assert.equal(is_user_action({event_name:'edit_saved',props:{source:'editor'}}),false);
});

test('first value requires active action after artifact/import, never retroactive credit',()=>{
  const s=createFunnelState('order');
  send(s,'edit_saved',{route:'new_story',props:{save_state:'saved'}});
  send(s,'material_captured');
  assert.deepEqual(send(s,'first_artifact_ready'),[]);assert.equal(s.firstValueSent,false);
  const m=createFunnelState('migration-order');
  send(m,'search_result_opened',{route:'migrate_existing'});
  assert.deepEqual(send(m,'import_succeeded'),[]);assert.equal(m.firstValueSent,false);
  assert.deepEqual(send(m,'material_linked'),['first_value_completed']);
});

test('0.4.0 derived flags and automatic capture do not contaminate current replay',()=>{
  const sid='legacy';
  const rows=['first_artifact_ready','material_captured','first_value_completed','deep_interaction'].map(name=>({...event(sid,name,{route:'new_story'}),funnel_version:'0.4.0'}));
  const s=replayFunnelState(rows,sid);assert.equal(s.artifact,false);assert.equal(s.firstValueSent,false);assert.equal(s.deepSent,false);
});

test('scenario telemetry allows only fixed identifiers, never custom manuscript strings',()=>{
  assert.deepEqual(sanitizeProps({scenario_id:'character'}),{scenario_id:'character'});
  assert.deepEqual(sanitizeProps({scenario_id:'private character name',input_mode:'private intent'}),{});
});
