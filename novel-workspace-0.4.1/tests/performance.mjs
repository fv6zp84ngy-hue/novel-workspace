import {Repository} from '../src/storage.mjs?v=0.4.0';
import {createDocument,snapshot,searchDocuments,verifyBackup} from '../src/domain.mjs?v=0.4.0';
const button=document.getElementById('run'),output=document.getElementById('results');
button.onclick=async()=>{
  button.disabled=true;output.textContent='正在准备隔离测试数据…';const name='novel-test-performance-'+crypto.randomUUID();const repo=new Repository(name);
  try{
    await repo.open();const {work,chapter}=await repo.createWork('性能测试作品');
    await repo.saveDocument(chapter.id,chapter.revision,{content:'长篇正文。'.repeat(20000)});
    const docs=Array.from({length:300},(_,i)=>createDocument(work.id,'material','资料 '+i,'故事素材。'.repeat(400)+(i%10===0?'林舟在灯塔寻找怀表。':'港口的另一段记忆。')));
    const start=performance.now();await repo.transact(['documents','revisions'],(s,done)=>{for(const d of docs){s('documents').add(d);s('revisions').add(snapshot(d));}done();});const writeMs=performance.now()-start;
    const readStart=performance.now();const all=await repo.list('documents');const readMs=performance.now()-readStart;
    const times=[];let hits=0;
    for(let i=0;i<30;i++){const at=performance.now();hits=searchDocuments(all,work.id,'林舟').length;times.push(performance.now()-at);}
    if(hits!==30)throw new Error('命中数量错误，预期 30，实际 '+hits);
    times.sort((a,b)=>a-b);const at=performance.now(),backup=await repo.exportBackup();await verifyBackup(backup);const backupMs=performance.now()-at;
    output.textContent=JSON.stringify({scope:'独立测试库，批量生成数据；不是用户增长或设备保证',documents:all.length,bodyCharacters:all.reduce((n,d)=>n+d.content.length,0),bulkSeedMs:+writeMs.toFixed(1),loadDocumentsMs:+readMs.toFixed(1),query:'林舟',hits,queryRuns:30,queryMedianMs:+times[15].toFixed(2),queryMaxMs:+times.at(-1).toFixed(2),backupExportAndVerifyMs:+backupMs.toFixed(1),backupBytes:new Blob([JSON.stringify(backup)]).size},null,2);
  }catch(err){output.textContent='抽样失败：'+err.message;}
  finally{repo.close();indexedDB.deleteDatabase(name);button.disabled=false;}
};
