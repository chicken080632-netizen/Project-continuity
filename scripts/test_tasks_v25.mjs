import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {taskCommand} from './tasks.mjs';
function fixture(fn){const root=fs.mkdtempSync(path.join(process.cwd(),'.v25-task-'));try{const write=(name,value)=>{const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof value==='string'?value:JSON.stringify(value));return p;};const call=(command,input)=>taskCommand(command,root,{task:'demo',...(input?{input:write('input.json',input)}:{})});write('req.txt','r1');write('out.txt','output');fn({root,write,call});}finally{fs.rmSync(root,{recursive:true,force:true});}}
const pin={revision:'r1',sources:['req.txt']},bind={revision:'r1',artifacts:['out.txt']};
test('v2.4 pin format and immutable delivery bind verify provenance',()=>fixture(({root,call,write})=>{
 call('task-pin',pin);assert.equal(call('task-check').ok,true);call('task-bind',bind);assert.equal(call('task-verify').ok,true);
 assert.throws(()=>call('task-bind',bind),/EEXIST/);assert.equal(taskCommand('task-health',root).ok,false);
 write('out.txt','edited');assert.equal(call('task-verify').ok,false);write('out.txt','output');write('req.txt','r2');assert.equal(call('task-check').ok,false);assert.equal(call('task-verify').ok,false);assert.throws(()=>call('task-bind',bind),/task-check/);
}));
test('rejects malformed pins and unsafe paths',()=>fixture(({call,write})=>{
 for(const input of [{revision:' ',sources:['req.txt']},{revision:'r',sources:[]},{revision:'r',sources:['../req.txt']},{revision:'r',sources:['C:/secret']},{revision:'r',sources:['req.txt','req.txt']},{revision:'r',sources:['./req.txt']}])assert.throws(()=>call('task-pin',input));
 write('.project-memory/tasks/demo/revision.json',{revision:'r',sources:[]});assert.throws(()=>call('task-check'),/sources/);
 write('.project-memory/tasks/demo/revision.json',{revision:'r',sources:[{path:'req.txt',sha256:'abc'}]});assert.throws(()=>call('task-check'),/sha256/);
}));
test('revision and manifest bytes are bound; metadata tampering fails',()=>fixture(({call,write,root})=>{
 call('task-pin',pin);assert.throws(()=>call('task-bind',{...bind,revision:'r2'}),/Revision/);call('task-bind',bind);
 const file=path.join(root,'.project-memory/tasks/demo/revision.json');fs.appendFileSync(file,' ');assert.equal(call('task-verify').ok,false);
 const delivery=JSON.parse(fs.readFileSync(path.join(root,'.project-memory/tasks/demo/delivery.json')));delivery.task='other';write('.project-memory/tasks/demo/delivery.json',delivery);assert.equal(call('task-verify').ok,false);
}));
test('health permits ordinary directories and reports orphan delivery, malformed pins and interrupted files without deleting',()=>fixture(({root,write})=>{
 write('.project-memory/tasks/ordinary/notes.txt','notes');assert.equal(taskCommand('task-health',root).ok,true);
 write('.project-memory/tasks/orphan/delivery.json','{}');write('.project-memory/tasks/broken/revision.json','bad');const temp=write('.project-memory/tasks/ordinary/delivery.json.tmp-interrupted','partial');
 const health=taskCommand('task-health',root);assert.equal(health.ok,false);assert.equal(health.findings.length,3);assert.equal(fs.existsSync(temp),true);
}));
test('linked sources and artifact paths are refused',t=>fixture(({root,call})=>{
 try{fs.symlinkSync(path.join(root,'req.txt'),path.join(root,'linked.txt'));}catch(e){if(['EPERM','EACCES'].includes(e.code)){t.skip('OS does not permit symlink creation');return;}throw e;}
 assert.throws(()=>call('task-pin',{revision:'r1',sources:['linked.txt']}),/Linked/);call('task-pin',pin);assert.throws(()=>call('task-bind',{revision:'r1',artifacts:['linked.txt']}),/Linked/);
}));
