import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const note = 'Hash verification establishes provenance and integrity, not content acceptance.';
function nonempty(value,label) { if(typeof value!=='string'||!value.trim()) throw Error(`${label} must be nonempty`); return value; }
function safe(root,relative) {
 nonempty(relative,'Relative path');
 if(path.isAbsolute(relative)||path.win32.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..'||p.includes(':'))) throw Error('Unsafe relative path');
 const target=path.resolve(root,relative);
 let current=root;
 if(fs.lstatSync(root).isSymbolicLink()) throw Error('Linked root refused');
 for(const part of relative.split('/')) {current=path.join(current,part);try {if(fs.lstatSync(current).isSymbolicLink())throw Error('Linked path refused');}catch(e){if(e.code!=='ENOENT')throw e;}}
 return target;
}
function bytes(root,relative) {const file=safe(root,relative);if(!fs.statSync(file).isFile())throw Error('Expected regular file');return fs.readFileSync(file);}
function records(value,label) {
 if(!Array.isArray(value)||!value.length)throw Error(`${label} must be nonempty`);
 const seen=new Set();
 for(const entry of value) {if(!entry||typeof entry!=='object')throw Error(`Invalid ${label}`);nonempty(entry.path,'path');if(!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid sha256');if(seen.has(entry.path))throw Error('Duplicate path');seen.add(entry.path);}
 return value;
}
function parseManifest(data) {const manifest=JSON.parse(data);nonempty(manifest.revision,'revision');records(manifest.sources,'sources');return manifest;}
function verifyRecords(root,entries) {const failures=[];for(const entry of entries)try {if(digest(bytes(root,entry.path))!==entry.sha256)throw Error('Hash mismatch');}catch(e){failures.push({source:entry.path,error:e.message});}return failures;}
function publish(root,relative,value) {
 const target=safe(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});safe(root,relative);
 const temp=relative+`.tmp-${crypto.randomUUID()}`;
 const fd=fs.openSync(safe(root,temp),'wx');
 try {fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 // Exclusive copying never replaces an existing pin. A process interruption can leave
 // an invalid destination; the retained temporary file lets health diagnose it.
 fs.copyFileSync(safe(root,temp),target,fs.constants.COPYFILE_EXCL);fs.unlinkSync(safe(root,temp));
 return target;
}
function taskId(value){nonempty(value,'task');if(!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value))throw Error('Invalid task id');return value;}
export function taskCommand(command,root,opts={}) {
 root=path.resolve(root);if(!fs.statSync(root).isDirectory())throw Error('Project must be a directory');
 const base='.project-memory/tasks';safe(root,base);
 if(command==='task-health') {
  const findings=[],tasks=[];const dir=safe(root,base);
  if(!fs.existsSync(dir))return {ok:true,tasks,findings,note};
  for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
   try {
    const rel=`${base}/${entry.name}`;safe(root,rel);
    if(!entry.isDirectory())throw Error('Unexpected task entry');
    const files=fs.readdirSync(safe(root,rel));
    for(const file of files)if(/(?:\.tmp(?:-|$)|\.pending|^pending)/.test(file))findings.push({task:entry.name,error:`Interrupted temporary file: ${file}`});
    if(!files.includes('revision.json')) {if(files.includes('delivery.json'))throw Error('Delivery has no revision');tasks.push({task:entry.name,pinned:false});continue;}
    const checked=taskCommand(files.includes('delivery.json')?'task-verify':'task-check',root,{task:entry.name});tasks.push(checked);
    if(!checked.ok)findings.push({task:entry.name,error:'Task verification failed',failures:checked.failures});
   }catch(e){findings.push({task:entry.name,error:e.message});}
  }
  return {ok:!findings.length,tasks,findings,note};
 }
 const id=taskId(opts.task),dir=`${base}/${id}`,manifestPath=`${dir}/revision.json`,deliveryPath=`${dir}/delivery.json`;
 safe(root,dir);
 if(command==='task-pin') {
  const input=JSON.parse(fs.readFileSync(nonempty(opts.input,'input'),'utf8'));nonempty(input.revision,'revision');
  if(!Array.isArray(input.sources)||!input.sources.length)throw Error('sources must be nonempty');
  const seen=new Set();const sources=input.sources.map(relative=>{if(seen.has(relative))throw Error('Duplicate path');seen.add(relative);if(relative===manifestPath||relative===deliveryPath)throw Error('Manifest cannot pin itself or delivery');return {path:relative,sha256:digest(bytes(root,relative))};});
  return {task:id,revision:input.revision,path:publish(root,manifestPath,{revision:input.revision,sources})};
 }
 const raw=bytes(root,manifestPath),manifest=parseManifest(raw),failures=verifyRecords(root,manifest.sources);
 if(command==='task-check')return {task:id,revision:manifest.revision,ok:!failures.length,failures,note};
 if(command==='task-bind') {
  if(failures.length)throw Error('Current task-check failed');
  const input=JSON.parse(fs.readFileSync(nonempty(opts.input,'input'),'utf8'));nonempty(input.revision,'revision');if(input.revision!==manifest.revision)throw Error('Revision mismatch');
  if(!Array.isArray(input.artifacts)||!input.artifacts.length)throw Error('artifacts must be nonempty');
  const seen=new Set();const artifacts=input.artifacts.map(relative=>{if(seen.has(relative))throw Error('Duplicate path');seen.add(relative);if(relative===deliveryPath||relative===manifestPath)throw Error('Cannot bind task metadata as artifact');return {path:relative,sha256:digest(bytes(root,relative))};});
  return {task:id,revision:manifest.revision,path:publish(root,deliveryPath,{task:id,revision:manifest.revision,manifestSha256:digest(raw),artifacts}),note};
 }
 if(command==='task-verify') {
  const delivery=JSON.parse(bytes(root,deliveryPath));nonempty(delivery.revision,'revision');records(delivery.artifacts,'artifacts');if(!/^[a-f0-9]{64}$/.test(delivery.manifestSha256))throw Error('Invalid manifest sha256');
  if(delivery.task!==id)failures.push({error:'Task mismatch'});
  if(delivery.revision!==manifest.revision)failures.push({error:'Revision mismatch'});
  if(delivery.manifestSha256!==digest(raw))failures.push({error:'Manifest hash mismatch'});
  failures.push(...verifyRecords(root,delivery.artifacts));
  return {task:id,revision:manifest.revision,ok:!failures.length,failures,note};
 }
 throw Error(`Unknown task command: ${command}`);
}

