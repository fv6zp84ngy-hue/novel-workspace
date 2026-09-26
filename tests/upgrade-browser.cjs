/* Optional macOS/Linux synthetic upgrade regression. Requires Python, Playwright and Chromium.
 * node tests/upgrade-browser.cjs previous-version.zip novel-workspace-latest.zip
 * Never uses an existing browser profile or author database. */
const {chromium}=require('playwright');
const {spawn,execFileSync}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const net=require('node:net');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const [oldZip,newZip]=process.argv.slice(2).map(p=>resolve(p));
if(!oldZip||!newZip)throw Error('Provide previous and latest ZIP paths');
const work=mkdtempSync(join(tmpdir(),'novel-upgrade-test-'));
const extract=(archive)=>execFileSync('python3',['-B','-c',`
import sys,zipfile
from pathlib import Path
root=Path(sys.argv[2])
with zipfile.ZipFile(sys.argv[1]) as z:
 names=z.namelist()
 prefix='' if 'index.html' in names else next(n[:-len('index.html')] for n in names if n.endswith('/index.html'))
 for name in names:
  if name.endswith('/'):continue
  relative=name[len(prefix):]
  target=root/relative
  if not target.resolve().is_relative_to(root.resolve()):raise ValueError('Unsafe archive path')
  target.parent.mkdir(parents=True,exist_ok=True)
  target.write_bytes(z.read(name))
`,archive,work]);
let child=null,browser=null;
async function stop(){
 if(!child)return;
 const active=child;child=null;
 if(active.exitCode!==null)return;
 const ended=once(active,'exit');
 process.kill(-active.pid,'SIGINT');
 await ended;
}
(async()=>{
 const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const origin=`http://127.0.0.1:${port}`;
 const start=async(current)=>{
  child=spawn('python3',['-B',current?'scripts/launch.py':'scripts/serve.py','--port',String(port),...(current?['--no-browser']:[])],{cwd:work,detached:true,stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error(log);
   try{if((await fetch(origin+'/VERSION')).ok)return;}catch{}
   await sleep(50);
  }throw Error('Test server did not start');
 };
 try{
  extract(oldZip);await start(false);
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext();const page=await context.newPage();
  await page.goto(origin+'/?qa=1&onboarding=treatment');
  await page.locator('#vault-password').fill('synthetic-upgrade-test-only');
  await page.locator('#vault-confirm').fill('synthetic-upgrade-test-only');
  await page.locator('#unlock-submit').click();
  await page.locator('#entry-intent').fill('合成升级作品：留住一段写作记忆。');
  await page.locator('#setup-form button.primary').click();
  await page.locator('#editor').waitFor();
  await page.locator('#doc-title').fill('升级前的合成标题');
  await page.locator('#editor').fill('这段合成正文在覆盖程序后应该仍然存在。');
  await page.locator('#save-now').click();
  await page.waitForFunction(()=>document.getElementById('save-status').textContent.includes('已保存到此浏览器'));
  await stop();extract(newZip);await start(true);
  assert.equal((await (await fetch(origin+'/VERSION')).text()).trim(),'0.4.1');
  assert.equal((await fetch(origin+'/.git/config')).status,404);
  await page.reload();
  await page.locator('#vault-password').fill('synthetic-upgrade-test-only');
  await page.locator('#unlock-submit').click();
  await page.locator('#editor').waitFor();
  assert.equal(await page.locator('#doc-title').inputValue(),'升级前的合成标题');
  assert.equal(await page.locator('#editor').inputValue(),'这段合成正文在覆盖程序后应该仍然存在。');
  // A second launch fails rather than opening another port or another storage origin.
  const duplicate=spawn('python3',['-B','scripts/launch.py','--port',String(port),'--no-browser'],{cwd:work,stdio:'pipe'});
  let error='';duplicate.stderr.on('data',b=>error+=b);
  const [code]=await once(duplicate,'exit');assert.notEqual(code,0);assert.match(error,/不会自动换端口/);
  console.log('PASS: full ZIP overwrite, launcher, same-origin encrypted title/content recovery, port collision, private path denial');
 }finally{
  if(browser)await browser.close();await stop();rmSync(work,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
