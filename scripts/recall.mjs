import {load,queryKey,extra} from './reliability.mjs';
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
function list(root,warnings=[]) { return load(root,'cues',warnings); }
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
  if(['memory-health','review-skip','feedback-resolve'].includes(command))return extra(command,root,opts,cueCommand);
  if(command==='feedback') {
    const cards=list(root),card=cards.find(c=>c.id===opts.card);
    if(!card) throw Error('Unknown --card');
    if(!['correct','irrelevant','outdated'].includes(opts.rating)) throw Error('rating must be correct/irrelevant/outdated');
    for(const key of ['query','reason']) if(typeof opts[key]!=='string'||!opts[key].trim()||opts[key].length>1000) throw Error(`Invalid --${key}`);
    if(!['user','agent'].includes(opts.actor)) throw Error('actor must be user/agent');
    if(typeof opts.input!=='string') throw Error('Missing --input (attributed feedback evidence JSON)');
    const supplied=JSON.parse(readText(path.resolve(opts.input)));
    const ev=evidence(root,supplied.source);
    if(typeof supplied.quote!=='string'||!supplied.quote.trim()||!ev.text.includes(supplied.quote)) throw Error('Feedback quote must match source');
    const id=crypto.randomUUID(),dir=inside(root,'.project-memory/feedback');fs.mkdirSync(dir,{recursive:true});
    const record={schema:'project-continuity/feedback/1',id,card:card.id,query:opts.query,rating:opts.rating,reason:opts.reason,actor:opts.actor,quote:supplied.quote,source:{...supplied.source,sha256:ev.sha256},createdAt:new Date().toISOString()};
    fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
    return {saved:id,rankingChanged:false,note:'Feedback is evidence to review, not permission to rewrite cards or user requirements.'};
  }
  if(command==='coverage') {
    const coverageWarnings=[],cards=list(root,coverageWarnings), archive=inside(root,'.project-memory/archive');
    const sources=[];
    if(fs.existsSync(archive)) for(const name of fs.readdirSync(archive)) {
      if(name.startsWith('.pending-')) continue;
      const relative=`.project-memory/archive/${name}/payload`;
      try {
        const lines=readText(inside(root,relative)).split(/\r?\n/);
        const covered=new Set(),skipped=new Set(); const stale=[];
        for(const rec of load(root,'reviewed',coverageWarnings).filter(r=>r.source.path.replaceAll('\\','/')===relative)){try{if(evidence(root,rec.source).sha256!==rec.source.sha256)throw Error('Changed skip');for(let n=rec.source.startLine;n<=rec.source.endLine;n++)skipped.add(n);}catch{stale.push(rec.id);}}
        for(const card of cards.filter(c=>c.source.path.replaceAll('\\','/')===relative)) {
          try {
            if(evidence(root,card.source).sha256!==card.source.sha256) {stale.push(card.id);continue;}
            for(let n=card.source.startLine;n<=card.source.endLine;n++) covered.add(n);
          } catch {stale.push(card.id);}
        }
        const pending=[];
        for(let n=1;n<=lines.length;n++) if(lines[n-1].trim()&&!covered.has(n)&&!skipped.has(n)) {
          const last=pending.at(-1);
          if(last&&last.endLine===n-1) last.endLine=n;
          else pending.push({startLine:n,endLine:n});
        }
        sources.push({path:relative,nonemptyLines:lines.filter(l=>l.trim()).length,coveredLines:[...covered].filter(n=>lines[n-1]?.trim()).length,reviewedSkippedLines:[...skipped].filter(n=>lines[n-1]?.trim()&&!covered.has(n)).length,pending,stale});
      } catch(e) {sources.push({path:relative,error:e.message});}
    }
    return {sources,warnings:coverageWarnings,note:'Line coverage is not semantic completeness. Review pending ranges; do not mechanically create cards for greetings or repetitions.'};
  }
  if(command==='remember') {
    if(typeof opts.input!=='string') throw Error('Missing --input');
    const input=JSON.parse(readText(path.resolve(opts.input)));
    const raw=Array.isArray(input)?input:[input];
    if(!raw.length || raw.length>100) throw Error('Batch must contain 1..100 cards');
    let cards=raw.map(card=>validate(root,card));
    if(new Set(cards.map(c=>c.id)).size!==cards.length) throw Error('Duplicate ids in batch');
    const ingestWarnings=[],existing=list(root,ingestWarnings);
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
    return {saved:cards.map(c=>c.id),skipped,warnings:ingestWarnings,path:dir};
  }
  const warnings=[],cards=list(root,warnings);
  if(command==='cue-verify') {
    const failures=[...warnings];
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
  const feedback=load(root,'feedback',warnings),resolutions=load(root,'resolutions',warnings);
  const hits=ranked.slice(0,limit).map(({card,score,matched})=>{
    let sourceState='unchanged';
    try {if(evidence(root,card.source).sha256!==card.source.sha256) sourceState='changed';} catch {sourceState='unavailable';}
    const replacedBy=cards.filter(c=>c.supersedes.includes(card.id)).map(c=>c.id);
    const relevantFeedback=feedback.filter(f=>f.card===card.id&&queryKey(f.query)===queryKey(opts.query));
    const feedbackSummary={count:relevantFeedback.length,ratings:{correct:0,irrelevant:0,outdated:0},recent:relevantFeedback.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,3).map(f=>{let sourceState='unchanged';try{if(evidence(root,f.source).sha256!==f.source.sha256)sourceState='changed';}catch{sourceState='unavailable';}return {id:f.id,rating:f.rating,actor:f.actor,reason:f.reason,source:f.source,sourceState};})};
    feedbackSummary.processing=relevantFeedback.map(f=>{const events=resolutions.filter(r=>r.feedback===f.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));const latest=events[0];let valid=true;if(latest){try{const ev=evidence(root,latest.source);if(ev.sha256!==latest.source.sha256||!ev.text.includes(latest.quote))throw Error('Resolution evidence changed');for(const id of latest.cards){const c=cards.find(c=>c.id===id);if(!c||evidence(root,c.source).sha256!==c.source.sha256)throw Error('Linked card unavailable');}}catch(e){valid=false;warnings.push({file:'resolutions/'+latest.id,error:e.message});}}return {feedback:f.id,state:latest?(valid?latest.state:'needs-review'):'pending',recordedState:latest?.state,cards:latest?.cards??[],events:events.map(e=>e.id)};});
    for(const f of relevantFeedback) if(Object.hasOwn(feedbackSummary.ratings,f.rating))feedbackSummary.ratings[f.rating]++;
    return {id:card.id,title:card.title,summary:card.summary,status:card.status,effectiveStatus:superseded.has(card.id)?'superseded':card.status,score,matched,source:card.source,sourceState,related:card.related,supersedes:card.supersedes,replacedBy,feedback:feedbackSummary};
  });
  return {mode:'local-cue-matching',hits,warnings,totalMatches:ranked.length,hint:hits.length?'Read source before relying on recalled candidates.':'No cue match; try alternate cues or raw search. Missing cards do not imply no history.'};
}
