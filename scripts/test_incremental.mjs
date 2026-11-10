import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {run} from './memory.mjs';
function fixture(fn){const root=fs.mkdtempSync(path.join(process.cwd(),'.incremental-test-'));try{fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('doctor finds missing entries without creating files; init repairs missing entries',()=>fixture(project=>{
  assert.equal(run('doctor',{project}).ok,false);
  assert.deepEqual(fs.readdirSync(project),[]);
  run('init',{project});assert.equal(run('doctor',{project}).ok,true);
  const index=path.join(project,'.project-memory/INDEX.md');fs.writeFileSync(index,'旧入口：保持此自定义内容');
  assert.ok(run('doctor',{project}).findings.some(f=>f.name==='memory-entry'&&f.state==='needs-update'));
  run('init',{project});assert.equal(fs.readFileSync(index,'utf8'),'旧入口：保持此自定义内容');
}));
test('incremental coverage, idempotent ingestion, duplicate detection, changed evidence and relocation',()=>fixture(root=>{
  const project=path.join(root,'project');fs.mkdirSync(project);run('init',{project});
  const input=path.join(root,'visible.txt');fs.writeFileSync(input,'猫住在宫殿里，采用水墨风格\n后续纠正：保留青绿色\n');
  const archived=run('archive',{project,input,kind:'excerpt',source:'合成测试对话',coverage:'两条可见消息'});
  const source=path.relative(project,path.join(archived.path,'payload')).replaceAll('\\','/');
  assert.equal(run('coverage',{project}).sources[0].pending[0].endLine,2);
  const card={id:'cat-palace',title:'猫与宫殿',summary:'测试讨论猫、宫殿、水墨',status:'proposed',cues:['猫','宫殿','水墨'],aliases:['猫咪','墨绘'],quote:'猫住在宫殿里',source:{path:source,startLine:1,endLine:1}};
  const cards=path.join(root,'cards.json');const save=c=>{fs.writeFileSync(cards,JSON.stringify(c));return run('remember',{project,input:cards});};
  assert.deepEqual(save(card).saved,['cat-palace']);
  assert.equal(save(card).skipped.length,1);
  assert.equal(save({...card,id:'duplicate'}).skipped[0].existingId,'cat-palace');
  assert.deepEqual(run('coverage',{project}).sources[0].pending,[{startLine:2,endLine:2}]);
  const moved=path.join(root,'moved');run('backup',{project,output:moved});
  assert.equal(run('recall',{project:moved,query:'猫咪 墨绘'}).hits[0].sourceState,'unchanged');
  fs.writeFileSync(path.join(archived.path,'payload'),'原文已被改写\n后续纠正：保留青绿色\n');
  assert.deepEqual(run('coverage',{project}).sources[0].stale,['cat-palace']);
  assert.equal(run('doctor',{project}).ok,false);
}));
