import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBlueprint,SCENARIOS} from '../src/blueprint.mjs?v=0.3.1';
import {createDocument,searchDocuments,escapeHTML,CATEGORIES,CATEGORY_HINTS,categorySuggestion} from '../src/domain.mjs?v=0.3.1';

test('eight novel scenarios create usable, explicit local structures',()=>{
  for(const s of SCENARIOS){const plan=makeBlueprint({intent:s.example,scenario:s.id});assert.equal(plan.scenario,s.id);assert.ok(plan.documents.some(d=>d.kind==='chapter'));assert.match(plan.documents[0].content,/不是 AI/);}
});
test('original migration notes are not rewritten',()=>{const original='  林舟：灯塔在八点亮起。\n\n原文结束。 ';const plan=makeBlueprint({route:'migrate',material:original,intent:'整理《雾港来信》'});assert.equal(plan.title,'雾港来信');assert.equal(plan.documents.find(d=>d.kind==='material').content,original);assert.ok(plan.hasImportedMaterial);});
test('empty migration does not fabricate imported notes',()=>{const plan=makeBlueprint({route:'migrate'});assert.equal(plan.hasImportedMaterial,false);assert.equal(plan.documents.length,2);});
test('oversized and invalid routes fail before writing',()=>{assert.throws(()=>makeBlueprint({intent:'a'.repeat(2001)}));assert.throws(()=>makeBlueprint({route:'unsupported'}));});
test('HTML-like text remains text and Chinese search stays in the current work',()=>{assert.equal(escapeHTML('<img src=x onerror=alert(1)>'),'&lt;img src=x onerror=alert(1)&gt;');const a=createDocument('a','material','灯塔','林舟的父亲');const b=createDocument('b','material','灯塔','林舟的父亲');assert.equal(searchDocuments([a,b],'a','林舟').length,1);});
test('novel craft categories remain optional and suggestions prefer title evidence',()=>{
  assert.equal(Object.keys(CATEGORIES).length,7);
  assert.ok(Object.keys(CATEGORIES).every(id=>CATEGORY_HINTS[id]));
  assert.equal(createDocument('w','material','', '随手记一句').category,'inbox');
  assert.equal(categorySuggestion({title:'伏笔清单',content:'林舟的父亲留下怀表'}).category,'clue');
  assert.equal(categorySuggestion({title:'主角关系',content:'结局出现转折'}).category,'character');
  assert.equal(categorySuggestion({title:'零散片段',content:'一段暂时没有用途的话'}).category,'inbox');
  assert.equal(makeBlueprint({scenario:'clues'}).documents.find(d=>d.kind==='material').category,'clue');
  assert.equal(makeBlueprint({route:'migrate',material:'原稿'}).documents.find(d=>d.kind==='material').category,'inbox');
});
