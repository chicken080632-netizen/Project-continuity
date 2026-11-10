// Cue-based local retrieval, not embedding inference. Feature extraction is done
// by the agent from visible evidence; this module validates and stores cards.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const norm = value => value.normalize('NFKC').toLocaleLowerCase().trim();
function inside(root, relative) {
  if (typeof relative!=='string' || path.isAbsolute(relative)) throw Error('Source must be project-relative');
  const dest=path.resolve(root,relative), rel=path.relative(root,dest);
  if (!rel || rel==='..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw Error('Source escapes project');
  let cursor=root;
  for (const part of rel.split(path.sep)) {
    cursor=path.join(cursor,part);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw Error('Linked source refused');
  }
  return dest;
}
function readText(file) {
  if (fs.statSync(file).size>16*1024*1024) throw Error('Card source exceeds 16 MiB; split into attributed excerpts');
  return new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(file));
}
function list(root) {
  const dir=inside(root,'.project-memory/cues');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n=>n.endsWith('.json')).sort().map(n=>{
    const file=inside(root,`.project-memory/cues/${n}`);
    const card=JSON.parse(readText(file));
    if (card.schema!=='project-continuity/cue/1' || `${card.id}.json`!==n) throw Error(`Invalid card: ${file}`);
    return card;
  });
}
function strings(value, field, required=false) {
  if (!Array.isArray(value) || value.length>40 || value.some(v=>typeof v!=='string'||!v.trim()||v.length>160) || (required&&!value.length)) throw Error(`Invalid ${field}`);
  return [...new Set(value.map(v=>v.trim()))];
}
function evidence(root, source) {
  if (!source || !Number.isInteger(source.startLine) || !Number.isInteger(source.endLine) || source.startLine<1 || source.endLine<source.startLine || source.endLine-source.startLine>200) throw Error('Invalid source range (1..201 lines)');
  const file=inside(root,source.path);
  if (path.relative(root,file).replaceAll('\\','/').startsWith('.project-memory/cues/')) throw Error('Source must be evidence, not another cue card');
  const lines=readText(file).split(/\r?\n/);
  if (source.endLine>lines.length) throw Error('Source range exceeds file');
  const text=lines.slice(source.startLine-1,source.endLine).join('\n');
  if (text.length>16000) throw Error('Source passage too long; split it');
  return {file,text,sha256:digest(text)};
}
function validate(root, raw) {
  if (!raw || typeof raw.id!=='string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(raw.id)) throw Error('Invalid cue id (lowercase ASCII required)');
  for (const f of ['title','summary']) if(typeof raw[f]!=='string'||!raw[f].trim()||raw[f].length>(f==='title'?160:800)) throw Error(`Invalid ${f}`);
  if (!['confirmed','proposed','unverified','superseded'].includes(raw.status)) throw Error('Invalid status');
  const cues=strings(raw.cues,'cues',true), aliases=strings(raw.aliases??[],'aliases'), entities=strings(raw.entities??[],'entities'), context=strings(raw.context??[],'context');
  const related=strings(raw.related??[],'related'), supersedes=strings(raw.supersedes??[],'supersedes');
  if(supersedes.length && raw.status!=='confirmed') throw Error('Only confirmed replacements may supersede older cards');
  const source={path:raw.source?.path,startLine:raw.source?.startLine,endLine:raw.source?.endLine};
  const ev=evidence(root,source);
  if(typeof raw.quote!=='string'||!raw.quote.trim()||raw.quote.length>1200||!ev.text.includes(raw.quote)) throw Error('quote must be exact text in source range');
  return {schema:'project-continuity/cue/1',id:raw.id,title:raw.title,summary:raw.summary,status:raw.status,cues,aliases,entities,context,related,supersedes,quote:raw.quote,source:{...source,sha256:ev.sha256},createdAt:new Date().toISOString()};
}
export function cueCommand(command,root,opts) {
  if(command==='coverage') {
    const cards=list(root), archive=inside(root,'.project-memory/archive');
    const sources=[];
    if(fs.existsSync(archive)) for(const name of fs.readdirSync(archive)) {
      if(name.startsWith('.pending-')) continue;
      const relative=`.project-memory/archive/${name}/payload`;
      try {
        const lines=readText(inside(root,relative)).split(/\r?\n/);
        const covered=new Set(); const stale=[];
        for(const card of cards.filter(c=>c.source.path.replaceAll('\\','/')===relative)) {
          try {
            if(evidence(root,card.source).sha256!==card.source.sha256) {stale.push(card.id);continue;}
            for(let n=card.source.startLine;n<=card.source.endLine;n++) covered.add(n);
          } catch {stale.push(card.id);}
        }
        const pending=[];
        for(let n=1;n<=lines.length;n++) if(lines[n-1].trim()&&!covered.has(n)) {
          const last=pending.at(-1);
          if(last&&last.endLine===n-1) last.endLine=n;
          else pending.push({startLine:n,endLine:n});
        }
        sources.push({path:relative,nonemptyLines:lines.filter(l=>l.trim()).length,coveredLines:[...covered].filter(n=>lines[n-1]?.trim()).length,pending,stale});
      } catch(e) {sources.push({path:relative,error:e.message});}
    }
    return {sources,note:'Line coverage is not semantic completeness. Review pending ranges; do not mechanically create cards for greetings or repetitions.'};
  }
  if(command==='remember') {
    if(typeof opts.input!=='string') throw Error('Missing --input');
    const input=JSON.parse(readText(path.resolve(opts.input)));
    const raw=Array.isArray(input)?input:[input];
    if(!raw.length || raw.length>100) throw Error('Batch must contain 1..100 cards');
    let cards=raw.map(card=>validate(root,card));
    if(new Set(cards.map(c=>c.id)).size!==cards.length) throw Error('Duplicate ids in batch');
    const existing=list(root);
    const fingerprint=c=>JSON.stringify([c.source.path.replaceAll('\\','/'),c.source.startLine,c.source.endLine,c.source.sha256,c.quote,c.status,c.summary,[...c.cues].sort(),[...c.aliases].sort(),[...c.entities].sort(),[...c.context].sort(),[...c.related].sort(),[...c.supersedes].sort()]);
    const known=new Map(existing.map(c=>[fingerprint(c),c.id])), skipped=[];
    cards=cards.filter(c=>{
      const key=fingerprint(c),same=existing.find(old=>old.id===c.id);
      if(same&&fingerprint(same)!==key) throw Error(`Card already exists: ${c.id}; use a new id and supersedes`);
      if(known.has(key)) {skipped.push({id:c.id,existingId:known.get(key)});return false;}
      known.set(key,c.id);return true;
    });
    const ids=new Set([...existing,...cards].map(c=>c.id));
    const graph=new Map([...existing,...cards].map(c=>[c.id,c.supersedes]));
    const visiting=new Set(),visited=new Set();
    function visit(id) {
      if(visiting.has(id)) throw Error('Supersedes cycle refused');
      if(visited.has(id)) return;
      visiting.add(id);
      for(const parent of graph.get(id)??[]) visit(parent);
      visiting.delete(id);visited.add(id);
    }
    for(const id of graph.keys()) visit(id);
    const dir=inside(root,'.project-memory/cues');
    for(const card of cards) {
      if(fs.existsSync(inside(root,`.project-memory/cues/${card.id}.json`))) throw Error(`Card already exists: ${card.id}; use a new id and supersedes`);
      for(const id of [...card.related,...card.supersedes]) if(!ids.has(id)||id===card.id) throw Error(`Invalid related/supersedes id: ${id}`);
    }
    fs.mkdirSync(dir,{recursive:true});
    // Preflight the whole batch; individual files use exclusive creation.
    for(const card of cards) fs.writeFileSync(path.join(dir,card.id+'.json'),JSON.stringify(card,null,2)+'\n',{flag:'wx'});
    return {saved:cards.map(c=>c.id),skipped,path:dir};
  }
  const cards=list(root);
  if(command==='cue-verify') {
    const failures=[];
    for(const card of cards) {
      try {
        validate(root,card);
        if(evidence(root,card.source).sha256!==card.source.sha256) throw Error('Source passage changed');
        for(const id of [...card.related,...card.supersedes]) if(!cards.some(c=>c.id===id)) throw Error(`Missing related card: ${id}`);
      } catch(e) {failures.push({id:card.id,error:e.message});}
    }
    return {ok:!failures.length,checked:cards.length,failures};
  }
  if(command!=='recall') throw Error('Unknown cue command');
  if(typeof opts.query!=='string'||!opts.query.trim()) throw Error('Missing --query');
  const limit=Number(opts.limit??5);
  if(!Number.isInteger(limit)||limit<1||limit>20) throw Error('recall limit must be 1..20');
  const terms=[...new Set(norm(opts.query).split(/[\s,，、;；|]+/u).filter(Boolean))];
  const superseded=new Set(cards.flatMap(c=>c.supersedes));
  const ranked=[];
  for(const card of cards) {
    if((card.status==='superseded'||superseded.has(card.id))&&opts['current-only']&&!opts['include-superseded']) continue;
    const fields=[['cues',6],['aliases',6],['entities',5],['context',3],['title',2],['summary',1]];
    let score=0;const matched=[];
    for(const term of terms) {
      let best=0,match;
      for(const [field,weight] of fields) for(const value of (Array.isArray(card[field])?card[field]:[card[field]])) {
        const text=norm(value);
        if(text.includes(term) && weight>best) {best=weight;match={term,field,value};}
      }
      if(best){score+=best;matched.push(match);}
    }
    if(score) ranked.push({card,score:score*matched.length,matched});
  }
  ranked.sort((a,b)=>b.score-a.score||a.card.id.localeCompare(b.card.id));
  const hits=ranked.slice(0,limit).map(({card,score,matched})=>{
    let sourceState='unchanged';
    try {if(evidence(root,card.source).sha256!==card.source.sha256) sourceState='changed';} catch {sourceState='unavailable';}
    const replacedBy=cards.filter(c=>c.supersedes.includes(card.id)).map(c=>c.id);
    return {id:card.id,title:card.title,summary:card.summary,status:card.status,effectiveStatus:superseded.has(card.id)?'superseded':card.status,score,matched,source:card.source,sourceState,related:card.related,supersedes:card.supersedes,replacedBy};
  });
  return {mode:'local-cue-matching',hits,totalMatches:ranked.length,hint:hits.length?'Read source before relying on recalled candidates.':'No cue match; try alternate cues or raw search. Missing cards do not imply no history.'};
}
