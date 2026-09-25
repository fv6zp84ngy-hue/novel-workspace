export const SCENARIOS = [
  {id:'starter',label:'开始新故事',en:'Start a story',example:'我想写一部悬疑小说，叫《雾港来信》，先把大纲、人物和第一章放在一起。'},
  {id:'character',label:'理清人物关系',en:'Characters',example:'我想整理一位回到故乡的主角、失踪的父亲和守塔人的关系，再写第一场见面。'},
  {id:'outline',label:'搭建篇章框架',en:'Outline',example:'帮我给一部成长小说准备开端、转折和结局的大纲位置，让我逐步补充。'},
  {id:'migration',label:'收好散落稿件',en:'Bring notes',example:'我的人物设定和正文散落在不同文件里，想先收进同一部作品，再找回并关联到章节。'},
  {id:'world',label:'整理世界规则',en:'World rules',example:'我在构思一座每晚改变街道的城市，想整理规则、地点和居民的生活。'},
  {id:'timeline',label:'核对故事时间线',en:'Timeline',example:'我想理清十年前的失踪和今天收到的信，给时间线与第一章分别留出位置。'},
  {id:'clues',label:'追踪伏笔线索',en:'Clues',example:'我想整理一部推理小说里的怀表、匿名信和灯塔线索，记录埋下与回收的位置。'},
  {id:'research',label:'归纳研究素材',en:'Research',example:'我收集了港口历史和航海资料，想记录来源，并在写到相关章节时快速找到。'}
];
export function makeBlueprint({intent='',route='new',scenario='starter',language='zh',title='',material=''}={}) {
  if(typeof intent!=='string'||intent.length>2000)throw new Error('需求文字请控制在 2,000 字以内。');
  if(!['new','migrate'].includes(route))throw new Error('请选择一种开始方式。');
  if(typeof material!=='string'||new TextEncoder().encode(material).length>2*1024*1024)throw new Error('稿件请控制在 2 MiB 以内。');
  const english=language==='en',selected=SCENARIOS.find(s=>s.id===scenario)||SCENARIOS[0];
  const quoted=intent.match(/[《「“]([^》」”]{1,60})[》」”]/)?.[1];
  const name=(title.trim()||quoted||(english?'Untitled story':'未命名作品')).slice(0,80);
  const outline=english?`My starting idea\n${intent.trim()||'To be written'}\n\nOpening\n\nTurning point\n\nEnding\n\nThis is an editable local template, not AI-generated fiction.`:`我的起点\n${intent.trim()||'还没想好，先从一句话开始。'}\n\n开端：主角想要什么？\n\n转折：是什么阻止了主角？\n\n结局：主角最终作出了什么选择？\n\n这是可编辑的本地模板，不是 AI 创作内容。`;
  const prompts={starter:['人物卡','名字：\n想要什么：\n害怕什么：'],character:['人物关系','人物：\n与主角的关系：\n尚未公开的秘密：'],outline:['篇章安排','开端：\n转折：\n结局：'],world:['世界规则','规则：\n代价：\n例外：'],timeline:['时间线','时间：\n发生的事：\n涉及人物：\n对应章节：'],clues:['伏笔清单','线索：\n首次出现：\n误导方向：\n回收位置：'],research:['研究笔记','原始来源：\n摘录：\n我的理解：\n可用的章节：'],migration:['整理说明','先保留原文，再搜索其中的人名或关键词，关联到正文后继续写作。']};
  const [materialTitle,body]=prompts[selected.id];
  const documents=[{kind:'outline',title:english?'Story outline':'故事大纲',content:outline},{kind:'chapter',title:english?'Chapter 1':'第一章',content:''}];
  if(material.trim())documents.push({kind:'material',title:english?'Imported notes':'带来的稿件',content:material,category:'inbox'});
  else if(route==='new')documents.push({kind:'material',title:english?selected.en:materialTitle,content:english?'Notes:\nMotivation or rules:\nSource:\nChapter to use this in:':body,category:({starter:'character',character:'character',outline:'plot',world:'world',timeline:'clue',clues:'clue',research:'reference'})[selected.id]||'inbox'});
  return {title:name,route,scenario:selected.id,language:english?'en':'zh',documents,tasks:english?['Write and save your first paragraph','Add a reference to this chapter']:['写下第一段并保存','给这一章关联一份资料'],hasImportedMaterial:!!material.trim()};
}
