import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {run} from './memory.mjs';
function fixture(fn){const project=fs.mkdtempSync(path.join(process.cwd(),'.v24-test-'));try{run('init',{project});fn(project);}finally{fs.rmSync(project,{recursive:true,force:true});}}
test('feedback is attributed and query-scoped; never silently changes ranking or cards',()=>fixture(project=>{
 fs.writeFileSync(path.join(project,'source.txt'),'猫在宫殿\n用户：这个结果无关\n');
 const input=path.join(project,'input.json');
 fs.writeFileSync(input,JSON.stringify({id:'cat',title:'猫',summary:'猫在宫殿',status:'proposed',cues:['猫'],quote:'猫在宫殿',source:{path:'source.txt',startLine:1,endLine:1}}));
 run('remember',{project,input});
 const before=run('recall',{project,query:'猫'}).hits[0];
 fs.writeFileSync(input,JSON.stringify({quote:'这个结果无关',source:{path:'source.txt',startLine:2,endLine:2}}));
 const opts={project,input,card:'cat',query:'猫',rating:'irrelevant',reason:'用户明确纠正',actor:'user'};
 run('feedback',opts);
 const after=run('recall',{project,query:'猫'}).hits[0];
 assert.equal(after.score,before.score);assert.equal(after.status,'proposed');assert.equal(after.feedback.ratings.irrelevant,1);
 assert.equal(run('recall',{project,query:'宫殿'}).hits[0].feedback.count,0);
 assert.throws(()=>run('feedback',{...opts,actor:'automatic'}),/actor/);
 fs.writeFileSync(input,JSON.stringify({quote:'伪造',source:{path:'source.txt',startLine:2,endLine:2}}));
 assert.throws(()=>run('feedback',opts),/quote/);
}));
test('requirements change invalidates old task pin and demands new immutable task revision',()=>fixture(project=>{
 fs.writeFileSync(path.join(project,'requirements.txt'),'r1 青绿色');
 const input=path.join(project,'pin.json');fs.writeFileSync(input,JSON.stringify({revision:'r1',sources:['requirements.txt']}));
 run('task-pin',{project,input,task:'design-r1'});
 assert.equal(run('task-check',{project,task:'design-r1'}).ok,true);
 fs.writeFileSync(path.join(project,'requirements.txt'),'r2 蓝色');
 assert.equal(run('task-check',{project,task:'design-r1'}).ok,false);
 assert.throws(()=>run('task-pin',{project,input,task:'design-r1'}),/EEXIST/);
 fs.writeFileSync(input,JSON.stringify({revision:'r2',sources:['requirements.txt']}));
 run('task-pin',{project,input,task:'design-r2'});
 assert.equal(run('task-check',{project,task:'design-r2'}).ok,true);
}));
