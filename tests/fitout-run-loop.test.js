import test from'node:test';
import assert from'node:assert/strict';
import{FitoutRun,FITOUT_RUN_SECONDS,FITOUT_DESIGN_SECONDS,FITOUT_BUILD_SECONDS}from'../prototypes/lib/fitout-run.js';
import{generateFitoutRun,FITOUT_LAYOUT_VARIANTS,FITOUT_SITUATIONS}from'../prototypes/lib/fitout-run-generator.js';
import{DEFAULT_FITOUT_PROFILE,migrateFitoutProfile,completeFitoutRun,loadFitoutProfile,saveFitoutProfile,FITOUT_PROFILE_KEY}from'../prototypes/lib/fitout-progression.js';
import{OfficeFloorPlanner,FLOOR_ITEM_TYPES}from'../prototypes/lib/office-floor-planner.js';
import{readFileSync}from'node:fs';

test('a complete planning and build session never exceeds three minutes',()=>{
  assert.equal(FITOUT_RUN_SECONDS,180);assert.equal(FITOUT_DESIGN_SECONDS,45);assert.equal(FITOUT_BUILD_SECONDS,135);
  const run=new FitoutRun({seed:'three-minutes'});run.tickPlanning(45);assert.equal(run.remaining,0);assert.equal(run.start(),true);run.tick(134);assert.equal(run.status,'building');run.tick(1);assert.equal(run.status,'lost');assert.ok(run.elapsed<=180)
});

test('fixing spends time while accepting risk visibly spends quality',()=>{
  const fix=new FitoutRun({seed:'fix'});fix.start();const fixed=fix.decide('wall','fix');assert.equal(fixed.delay,5);assert.equal(fix.quality,100);assert.equal(fix.budget,96);
  const risk=new FitoutRun({seed:'risk'});risk.start();const accepted=risk.decide('wall','risk');assert.equal(accepted.quality,-12);assert.equal(risk.quality,88);assert.equal(risk.budget,99);assert.equal(risk.decide('wall','risk'),false)
});

test('run generator is deterministic and gives one contextual surprise per construction phase',()=>{
  const profile={...DEFAULT_FITOUT_PROFILE,runs:5,unlockedLayouts:Object.keys(FITOUT_LAYOUT_VARIANTS),unlockedBriefs:['startup','agency','legal','support','hybrid'],unlockedConditions:['narrow_delivery','legacy_wiring','live_office','missing_lift','crooked_slab','cost_pressure','late_change']},first=generateFitoutRun('seed-42',profile),same=generateFitoutRun('seed-42',profile),other=generateFitoutRun('seed-43',profile);assert.deepEqual(first,same);assert.notDeepEqual(first,other);assert.deepEqual(first.situations.map(item=>item.phase),['demolition','partition','engineering','finish','furniture']);assert.ok(FITOUT_SITUATIONS.length>=12)
});

test('every unlocked generated layout auto-plans a connected office for its brief',()=>{
  const profile={...DEFAULT_FITOUT_PROFILE,runs:7,unlockedLayouts:Object.keys(FITOUT_LAYOUT_VARIANTS),unlockedBriefs:['startup','agency','legal','support','hybrid'],unlockedConditions:['narrow_delivery']};for(let index=0;index<20;index++){const scenario=generateFitoutRun(`layout-${index}`,profile),plan=new OfficeFloorPlanner({variant:scenario.layout.id,brief:scenario.brief}),snapshot=plan.autoPlan({variant:scenario.layout.id});assert.equal(snapshot.metrics.connectivity.complete,true,scenario.layout.id);assert.equal(snapshot.complete,true,`${scenario.layout.id}:${scenario.brief.id}`)}});

test('progression migrates legacy state and unlocks layouts furniture briefs and conditions',()=>{
  const migrated=migrateFitoutProfile({}, {runs:2,wins:1,relationships:{semyon:4},lessons:['axis']});assert.equal(migrated.version,2);assert.equal(migrated.runs,2);assert.equal(migrated.relationships.semyon,4);
  const result=completeFitoutRun(migrated,{won:true,seconds:144,quality:88,seed:'next',situations:['axis_shift']});assert.equal(result.profile.runs,3);assert.equal(result.profile.bestSeconds,144);assert.ok(result.profile.unlockedLayouts.includes('bent'));assert.ok(result.profile.unlockedFurniture.includes('kitchenette'));assert.ok(result.profile.unlockedBriefs.includes('support'));assert.ok(result.profile.unlockedConditions.includes('cost_pressure'));assert.ok(Object.keys(FLOOR_ITEM_TYPES).length>=12)
});

test('versioned profile survives a localStorage-compatible round trip',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};assert.equal(saveFitoutProfile(storage,{...DEFAULT_FITOUT_PROFILE,runs:4}),true);assert.ok(data.has(FITOUT_PROFILE_KEY));assert.equal(loadFitoutProfile(storage).runs,4)
});

test('every physical dilemma has large direct fix and risk controls for iPad',()=>{const chapter=readFileSync(new URL('../prototypes/fitout-chapter-one.html',import.meta.url),'utf8');for(const token of['issuedDecisionActions','issuedFixButton','issuedRiskButton','ИСПРАВИТЬ ·','ОСТАВИТЬ ·','resolveIssuedIncident(false)','resolveIssuedCheck(issuedDecision.id,false)'])assert.match(chapter,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))})
