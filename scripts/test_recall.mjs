import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {run} from './memory.mjs';

function fixture(fn) {
  const root=fs.mkdtempSync(path.join(process.cwd(),'.recall-test-'));
  try {
    run('init',{project:root});
    fs.writeFileSync(path.join(root,'visible.txt'),'用户：屋顶保留原样\n用户：先讨论蓝色灯光\n助手：提出金色灯光方案\n');
    fn(root);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}
function card(id,extra={}) {
  return {id,title:'屋顶修改要求',summary:'用户要求保留屋顶',status:'confirmed',cues:['屋顶','保留原样'],aliases:['屋面'],entities:['建筑'],context:['修改边界'],quote:'屋顶保留原样',source:{path:'visible.txt',startLine:1,endLine:1},...extra};
}
function remember(project,cards) {
  const input=path.join(project,'cards-input.json');
  fs.writeFileSync(input,JSON.stringify(cards));
  return run('remember',{project,input});
}
test('alias awakens a source with no literal alias; multi-cue ranks before generic match',()=>fixture(project=>{
  remember(project,[card('roof'),card('generic',{cues:['建筑'],aliases:[],summary:'建筑讨论'})]);
  const result=run('recall',{project,query:'屋面 保留原样',limit:'1'});
  assert.equal(result.hits.length,1);
  assert.equal(result.hits[0].id,'roof');
  assert.ok(result.hits[0].matched.some(m=>m.field==='aliases'));
  assert.equal(result.hits[0].sourceState,'unchanged');
  assert.equal(result.hits[0].source.startLine,1);
  assert.equal(run('cue-verify',{project}).ok,true);
  assert.equal(run('recall',{project,query:'不存在的猫'}).hits.length,0);
}));
test('rejects fabricated quotes, traversal, invalid ranges and duplicate ids without overwrite',()=>fixture(project=>{
  assert.throws(()=>remember(project,card('bad',{quote:'不存在的原话'})),/quote/);
  assert.throws(()=>remember(project,card('escape',{source:{path:'../outside.txt',startLine:1,endLine:1}})),/escapes/);
  assert.throws(()=>remember(project,card('range',{source:{path:'visible.txt',startLine:1,endLine:999}})),/range/);
  remember(project,card('same'));
  assert.throws(()=>remember(project,card('same',{summary:'被覆盖'})),/already exists/);
  assert.equal(run('recall',{project,query:'屋顶'}).hits[0].summary,'用户要求保留屋顶');
}));
test('historical recall preserves old cues, marks replacements and supports current-only lookup',()=>fixture(project=>{
  remember(project,[card('old'),card('new',{supersedes:['old']}),card('idea',{status:'proposed'})]);
  const result=run('recall',{project,query:'屋顶','current-only':true});
  assert.ok(!result.hits.some(c=>c.id==='old'));
  assert.equal(result.hits.find(c=>c.id==='idea').status,'proposed');
  assert.ok(run('recall',{project,query:'屋顶','include-superseded':true}).hits.some(c=>c.id==='old'));
  const old=run('recall',{project,query:'屋顶'}).hits.find(c=>c.id==='old');
  assert.equal(old.effectiveStatus,'superseded');
  assert.deepEqual(old.replacedBy,['new']);
}));
test('changed or lost sources remain candidates with explicit warnings; verification fails',()=>fixture(project=>{
  remember(project,card('roof'));
  fs.writeFileSync(path.join(project,'visible.txt'),'用户：屋顶可以修改\n');
  assert.equal(run('recall',{project,query:'屋面'}).hits[0].sourceState,'changed');
  assert.equal(run('cue-verify',{project}).ok,false);
  fs.unlinkSync(path.join(project,'visible.txt'));
  assert.equal(run('recall',{project,query:'屋面'}).hits[0].sourceState,'unavailable');
}));
test('batch preflight rejects unknown relations and never writes earlier valid cards',()=>fixture(project=>{
  assert.throws(()=>remember(project,[card('first'),card('second',{related:['missing']})]),/related/);
  assert.equal(run('recall',{project,query:'屋顶'}).hits.length,0);
  assert.throws(()=>remember(project,[card('a',{supersedes:['b']}),card('b',{supersedes:['a']})]),/cycle/);
  assert.throws(()=>remember(project,[card('old'),card('idea',{status:'proposed',supersedes:['old']})]),/confirmed replacements/);
}));
