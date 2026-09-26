/* Optional browser regression: requires Playwright + Chromium installed by the tester.
 * Uses a fresh ephemeral browser context, qa=1 and synthetic content only. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const target=new URL(process.argv[2]||'http://127.0.0.1:8777/');
if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname))throw Error('Use a loopback test server');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const variant of ['control','treatment']){
   const context=await browser.newContext();
   const page=await context.newPage();
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(`${target.origin}/?qa=1&onboarding=${variant}`);
   // A disposable local encryption fixture, not a service/account credential.
   await page.locator('#vault-password').fill('synthetic-vault-test-only');
   await page.locator('#vault-confirm').fill('synthetic-vault-test-only');
   await page.locator('#unlock-submit').click();
   await page.locator('#entry-intent').waitFor();
   const events=()=>page.evaluate(async()=> (await import('/src/analytics.mjs?v=0.4.1')).readAllEvents());
   const waitEvent=async name=>{for(let i=0;i<100;i++){if((await events()).some(e=>e.event_name===name))return;await page.waitForTimeout(50);}throw Error(`Missing ${name}`);};
   await page.waitForTimeout(250);
   if(variant==='treatment')assert.equal((await events()).filter(e=>e.event_name==='scenario_impression').length,0,'collapsed cards must not count');
   if(variant==='treatment')await page.locator('details summary').click();
   await page.locator('[data-scenario="character"]').click();
   await page.locator('[data-scenario="character"][aria-pressed="true"]').waitFor({state:'attached'});
   await page.locator('#entry-intent').fill('我想写一个关于失忆侦探寻找真相的故事');
   await page.locator('#setup-form button.primary').click();
   if(variant==='control')await page.locator('#deliver-now').click();
   await page.locator('#editor').waitFor();
   await waitEvent('material_captured');
   let rows=await events();
   assert.ok(rows.some(e=>e.event_name==='first_artifact_ready'));
   assert.ok(!rows.some(e=>e.event_name==='first_value_completed'),'Case A: auto capture cannot activate');
   assert.ok(rows.some(e=>e.event_name==='intent_submitted'&&e.entry_mode==='natural_language'&&e.props.scenario_id==='character'),JSON.stringify(rows));
   assert.ok(rows.some(e=>e.event_name==='scenario_selected'&&e.props.scenario_id==='character'),JSON.stringify(rows));
   await page.locator('#doc-title').fill('合成标题修改');
   await page.locator('#save-now').click();
   await waitEvent('first_value_completed');
   rows=await events();
   assert.ok(rows.some(e=>e.event_name==='edit_saved'&&e.props.source==='editor'),'Case B: title-only persisted save counts');
   assert.ok(!rows.some(e=>e.event_name==='deep_interaction'),'auto capture cannot be a second action');
   await page.locator('[data-page="library"]').click();
   await page.locator('#library-import').click();
   await page.locator('#material-content').fill('合成资料：侦探随身携带一块蓝色怀表。');
   await page.locator('#paste-form button.primary').click();
   await page.locator('#library-search').click();
   await page.locator('#query').fill('蓝色怀表');
   await page.locator('#search-form button').click();
   await page.locator('[data-result]').first().click();
   await waitEvent('deep_interaction');
   rows=await events();
   assert.equal(rows.filter(e=>e.event_name==='first_value_completed').length,1);
   assert.equal(rows.filter(e=>e.event_name==='deep_interaction').length,1);
   assert.ok(!JSON.stringify(rows).includes('蓝色怀表'));
   assert.ok(!JSON.stringify(rows).includes('合成标题修改'));
   await page.reload();
   await page.locator('#vault-password').fill('synthetic-vault-test-only');
   await page.locator('#unlock-submit').click();
   await page.locator('#editor').waitFor();
   rows=await events();
   assert.equal(rows.filter(e=>e.event_name==='first_value_completed').length,1,'reload must not emit twice');
   assert.equal(rows.filter(e=>e.event_name==='deep_interaction').length,1);
   // Starting another attempt must not inherit earlier active actions or derived flags.
   await page.locator('#setup-open').click();
   await page.locator('[data-route="migrate"]').click();
   if(variant==='treatment'){
    await page.locator('#entry-file').setInputFiles({name:'character.txt',mimeType:'text/plain',buffer:Buffer.from('合成迁移资料：白塔渡口的失忆侦探。')});
    await page.locator('#entry-material').inputValue().then(async value=>{if(!value)await page.waitForTimeout(200);});
   }else await page.locator('#entry-material').fill('合成迁移资料：白塔渡口的失忆侦探。');
   await page.locator('#setup-form button.primary').click();
   if(variant==='control')await page.locator('#deliver-now').click();
   const currentEvents=async()=>{const sid=await page.evaluate(()=>sessionStorage.getItem('nw_session_id'));return (await events()).filter(e=>e.session_id===sid);};
   for(let i=0;i<100&&!(await currentEvents()).some(e=>['import_succeeded','paste_saved'].includes(e.event_name));i++)await page.waitForTimeout(50);
   let migration=await currentEvents();
   assert.ok(migration.some(e=>['import_succeeded','paste_saved'].includes(e.event_name)));
   assert.ok(!migration.some(e=>e.event_name==='first_value_completed'));
   if(variant==='control')await page.locator('#library-search').click();
   await page.locator('#query').fill('白塔渡口');
   await page.locator('#search-form button').click();
   await page.locator('[data-result]').first().click();
   for(let i=0;i<100&&!(await currentEvents()).some(e=>e.event_name==='first_value_completed');i++)await page.waitForTimeout(50);
   migration=await currentEvents();
   assert.equal(migration.filter(e=>e.event_name==='first_value_completed').length,1);
   assert.ok(!migration.some(e=>e.event_name==='deep_interaction'));
   assert.ok(migration.some(e=>e.event_name==='search_result_opened'&&e.props.source==='search'));
   await page.locator('#setup-open').click();
   if(variant==='treatment')await page.locator('details summary').click();
   await page.locator('[data-scenario="starter"]').click();
   await page.locator('#setup-form button.primary').click();
   if(variant==='control')await page.locator('#deliver-now').click();
   await page.locator('#editor').waitFor();
   const templateRows=await currentEvents();
   assert.ok(templateRows.some(e=>e.event_name==='intent_submitted'&&e.entry_mode==='template'));
   assert.ok(!templateRows.some(e=>e.event_name==='intent_submitted'&&e.entry_mode==='natural_language'));
   await page.goto(`${target.origin}/debug/funnel.html`);
   await page.locator('#run-cases').click();
   assert.match(await page.locator('#case-results').textContent(),/首次价值=false/);
   assert.match(await page.locator('#case-results').textContent(),/首次价值=true/);
   assert.deepEqual(errors,[]);
   console.log(`PASS ${variant}: hidden exposure, attribution, Case A/B, active deep interaction, privacy, reload, isolated migration, template mode, debug cases`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
