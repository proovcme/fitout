import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const chapter=readFileSync(new URL('../prototypes/fitout-chapter-one.html',import.meta.url),'utf8');

test('all seven issued characters receive readable procedural activity',()=>{
  for(const token of ['issuedActivityRigs','createIssuedActivityRig','updateIssuedActivity(dt)','for(const[id,npc]of issuedCast)','activity.rig.visible=carrying||working'])assert.match(chapter,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(chapter,/createIssuedActivityRig\(id,npc\);const brain=new SiteWorkerBrain/);
  assert.match(chapter,/updateIssuedActivity\(dt\);const working=/);
});

test('work states visibly distinguish travel carrying and active work',()=>{
  assert.match(chapter,/state==='to_supply'\?'walk':state==='to_work'\|\|state==='carrying'\?'carry'/);
  assert.match(chapter,/working&&\['layout','wall','network','finish','furniture'\]\.includes\(order\?\.kind\)/);
  assert.match(chapter,/particle\.position\.set/);
  assert.match(chapter,/npc\.plane\.rotation\.z=THREE\.MathUtils\.lerp/);
});

test('completed sessions preserve relationships and increase the next run depth',()=>{
  assert.match(chapter,/FITOUT_RUN_META_KEY='fitout-run-meta-v1'/);
  assert.match(chapter,/depth:\(savedFitoutRunMeta\.runs\|\|0\)\+1/);
  assert.match(chapter,/localStorage\.setItem\(FITOUT_RUN_META_KEY,JSON\.stringify\(fitoutRun\.meta\)\)/);
  assert.match(chapter,/fitoutRun\.remember\(npc\.profile\.storyId,safe\?1:-1/);
});
