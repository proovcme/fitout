import {
  closeDayFinances,
  createInitialState,
  hireContractor,
  hireTeamMember,
  selectOrder,
  submitTaskForAcceptance,
  takeOrganizationLoan,
  tickState,
} from '../game-core.js';
import { allRandomEvents } from '../events/index.js';
import { createCampaignOrders } from '../order-generator.js';

const scenarios=[
  {name:'бережливый',contractors:['designers'],team:['doc-control'],loan:0},
  {name:'сбалансированный',contractors:['movers','designers','engineers','painters','electricians','assemblers','cleaners'],team:[],loan:0,required:true},
  {name:'стройимперия сразу',contractors:['designers','movers','engineers','painters','electricians','assemblers','cleaners'],team:['pm','supervision','doc-control'],loan:300},
];

function simulate(spec){
  const state=createInitialState(()=>.99,allRandomEvents);
  if(!selectOrder(state,createCampaignOrders()[0]))throw new Error('tutorial order unavailable');
  state.tutorial=null;
  if(spec.loan)takeOrganizationLoan(state,spec.loan,'organization');
  for(const id of spec.team)if(!hireTeamMember(state,id).ok)throw new Error(`${spec.name}: cannot hire ${id}`);
  for(const id of spec.contractors)if(!hireContractor(state,id).ok)throw new Error(`${spec.name}: cannot hire ${id}`);
  Object.assign(state,{phase:'execution',started:true,paused:false,eventSchedule:[],nextMajorEventAt:1e9,nextSituationAt:1e9});
  for(const task of state.tasks)task.enabledToday=true;
  let closedDay=-1;
  for(let step=0;step<1200&&!state.completed;step+=1){
    tickState(state,.25);
    for(const task of state.tasks.filter(item=>item.status==='awaiting'))submitTaskForAcceptance(state,task.id,()=>0);
    if(state.needsReport){const day=Math.floor(state.elapsed/24);if(day!==closedDay){closeDayFinances(state);closedDay=day;}state.reportedDay=day;state.needsReport=false;state.paused=false;}
    if(state.needsPlanning){state.plannedDay=Math.floor(state.elapsed/24);state.needsPlanning=false;state.paused=false;for(const task of state.tasks)task.enabledToday=true;}
  }
  return {
    strategy:spec.name,
    completed:state.completed,
    onTime:state.completed&&state.elapsed<=state.contract.deadlineHours,
    hours:Number(state.elapsed.toFixed(2)),
    deadline:state.contract.deadlineHours,
    profit:state.projectSettlement?.profit??null,
    companyCash:Math.round(state.company.cash),
    debt:Math.round(state.company.debt),
  };
}

const results=scenarios.map(simulate);
console.table(results);
const required=results[scenarios.findIndex(item=>item.required)];
if(!required.completed||!required.onTime||required.profit<=0||required.debt!==0){
  throw new Error(`economy gate failed: ${JSON.stringify(required)}`);
}
console.log('economy audit ok · honest on-time profitable path exists without credit');
