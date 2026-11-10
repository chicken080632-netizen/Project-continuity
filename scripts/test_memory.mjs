import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {run} from './memory.mjs';

function fixture(fn) {
  const root=fs.mkdtempSync(path.join(process.cwd(),'.continuity-test-'));
  try { return fn(root); } finally { fs.rmSync(root,{recursive:true,force:true}); }
}
test('dry run, repeat initialization and existing user content',()=>fixture(root=>{
  const rules=path.join(root,'AGENTS.md');
  const original=Buffer.from('# 中文规则\r\n保持现状\r\n'); fs.writeFileSync(rules,original);
  run('init',{project:root,'dry-run':true});
  assert.deepEqual(fs.readdirSync(root),['AGENTS.md']);
  assert.deepEqual(fs.readFileSync(rules),original);
  run('init',{project:root});
  const current=path.join(root,'.project-memory/current.md'); fs.writeFileSync(current,'用户最新检查点');
  const before=fs.readFileSync(rules);
  assert.deepEqual(run('init',{project:root}).actions,[]);
  assert.deepEqual(fs.readFileSync(rules),before);
  assert.equal(fs.readFileSync(current,'utf8'),'用户最新检查点');
}));
test('invalid markers fail before any memory write',()=>fixture(root=>{
  fs.writeFileSync(path.join(root,'AGENTS.md'),'<!-- project-continuity:start -->');
  assert.throws(()=>run('init',{project:root}),/markers/);
  assert.equal(fs.existsSync(path.join(root,'.project-memory')),false);
}));
test('archive preserves exact bytes, searches Chinese, detects corruption and missing payload',()=>fixture(root=>{
  run('init',{project:root});
  const input=path.join(root,'export.txt'),bytes=Buffer.from('用户：保留屋顶\r\n助手：完成\r\n');fs.writeFileSync(input,bytes);
  const opts={project:root,input,kind:'excerpt',source:'本次可见消息',coverage:'1-2，缺早期记录'};
  const result=run('archive',opts);
  assert.deepEqual(fs.readFileSync(path.join(result.path,'payload')),bytes);
  assert.equal(run('verify',{project:root}).ok,true);
  assert.ok(run('search',{project:root,query:'屋顶',limit:'1'}).hits[0].excerpt.includes('屋顶'));
  fs.writeFileSync(path.join(result.path,'payload'),'损坏');
  assert.equal(run('verify',{project:root}).ok,false);
  fs.unlinkSync(path.join(result.path,'payload'));
  assert.equal(run('verify',{project:root}).ok,false);
  assert.throws(()=>run('archive',{...opts,coverage:''}),/coverage/);
}));
test('backup restores verifiable archive and refuses overwrite or nested output',()=>fixture(root=>{
  const project=path.join(root,'project');fs.mkdirSync(project);run('init',{project});
  const input=path.join(root,'report.txt');fs.writeFileSync(input,'报告');
  run('archive',{project,input,kind:'report',source:'工具测试',coverage:'完整测试报告'});
  const output=path.join(root,'backup');run('backup',{project,output});
  assert.equal(run('verify',{project:output}).ok,true);
  assert.throws(()=>run('backup',{project,output}),/exist/);
  assert.throws(()=>run('backup',{project,output:path.join(project,'.project-memory','nested')}),/inside/);
}));
test('linked memory is refused (or explicitly skipped if OS denies link creation)',t=>fixture(root=>{
  const project=path.join(root,'project'),outside=path.join(root,'outside');fs.mkdirSync(project);fs.mkdirSync(outside);
  try {fs.symlinkSync(outside,path.join(project,'.project-memory'),process.platform==='win32'?'junction':'dir');}
  catch(e) {if(['EPERM','EACCES'].includes(e.code)){t.skip('OS link privilege unavailable');return;}throw e;}
  assert.throws(()=>run('init',{project}),/Linked/);
  assert.deepEqual(fs.readdirSync(outside),[]);
}));
