import test from'node:test';
import assert from'node:assert/strict';
import{OfficeFloorPlanner}from'../prototypes/lib/office-floor-planner.js';
import{analyzeOfficeCommissioning,calculateFitoutScore,officeRoute,OFFICE_COMMISSION_PERSONAS}from'../prototypes/lib/office-commissioning.js';

const completePlan=()=>{const planner=new OfficeFloorPlanner();planner.autoPlan();return planner};

test('commissioning sends three named people through the office they designed',()=>{
  const snapshot=completePlan().snapshot(),result=analyzeOfficeCommissioning(snapshot);assert.equal(result.journeys.length,3);assert.deepEqual(result.journeys.map(person=>person.id),OFFICE_COMMISSION_PERSONAS.map(person=>person.id));assert.ok(result.journeys.every(person=>person.steps.length>=2));assert.ok(result.observations.some(item=>item.kind==='ok'));assert.ok(result.score>0)
});

test('commissioning routes respect rooms doors and the permanent entrance',()=>{
  const planner=completePlan(),snapshot=planner.snapshot(),meeting=snapshot.cells.findIndex(cell=>cell.item==='meetingTable'),route=officeRoute(snapshot,snapshot.entranceIndex,meeting);assert.ok(route.length>2);assert.equal(route[0],snapshot.entranceIndex);assert.equal(route.at(-1),meeting);for(let index=1;index<route.length;index++){const one=snapshot.cells[route[index-1]],two=snapshot.cells[route[index]];assert.ok(one.room===two.room||(one.room==='corridor'&&two.door)||(two.room==='corridor'&&one.door))}
});

test('a desk without nearby power becomes a human complaint rather than a hidden score loss',()=>{
  const planner=completePlan();for(const cell of planner.cells)if(cell.room==='work')cell.socket=false;const result=analyzeOfficeCommissioning(planner.snapshot()),complaint=result.observations.find(item=>item.kind==='unpowered');assert.ok(complaint);assert.match(complaint.text,/Розетку/);assert.ok(result.score<100);assert.match(result.whatIf,/питание/)
});

test('an unreachable room becomes a visible blocked journey',()=>{
  const planner=completePlan(),meetingDoor=planner.cells.findIndex(cell=>cell.room==='meeting'&&cell.door);planner.cells[meetingDoor].door=false;const result=analyzeOfficeCommissioning(planner.snapshot());assert.ok(result.observations.some(item=>item.kind==='blocked'));assert.ok(result.issues.includes('blocked'));assert.match(result.whatIf,/дверью и коридором/)
});

test('final points reward a better office and a faster run while preserving partial credit',()=>{
  const baseline=calculateFitoutScore({won:true,quality:70,commissionScore:70,seconds:150}),better=calculateFitoutScore({won:true,quality:90,commissionScore:90,seconds:100});assert.ok(better>baseline);assert.equal(calculateFitoutScore({won:false,quality:80,buildProgress:.5}),1860)
});
