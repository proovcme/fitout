import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, resolveSituation, tickState } from '../game-core.js';
import { SITUATIONS } from '../situations.js';

test('contractor situations form a broad two-choice question bank',()=>{
  assert.ok(SITUATIONS.length>=24);
  assert.equal(new Set(SITUATIONS.map(item=>item.id)).size,SITUATIONS.length);
  for(const item of SITUATIONS){assert.equal(item.choices.length,2);assert.ok(item.skill);assert.ok(item.resolver);}
});

test('answering a question removes its exclamation and applies consequences',()=>{
  const state=createInitialState();const template=SITUATIONS[0];
  state.activeSituations=[{uid:'question-1',templateId:template.id,crewId:'foreman',expiresAt:10}];
  const before=state.budget;
  assert.equal(resolveSituation(state,'question-1',template.choices[0].id),true);
  assert.equal(state.activeSituations.length,0);
  assert.equal(state.budget,before+template.choices[0].deltas.budget);
});

test('a situation stays over a crew when there is no team to answer it',()=>{
  const state=createInitialState();
  state.started=true;state.paused=false;state.plannedDay=0;state.nextSituationAt=0;
  tickState(state,.05);
  assert.equal(state.activeSituations.length,1);
  assert.ok(state.activeSituations[0].crewId);
});

test('a hired team automatically resolves some incoming questions',()=>{
  let autoSolved=false;
  for(let seed=1;seed<120&&!autoSolved;seed+=1){
    const state=createInitialState();
    state.visualSeed=seed;state.started=true;state.paused=false;state.plannedDay=0;state.nextSituationAt=0;
    state.team.forEach(member=>{member.hired=true;});
    tickState(state,.05);
    autoSolved=state.log.some(entry=>entry.text.includes('сам(а) решил(а)'));
  }
  assert.equal(autoSolved,true);
});
