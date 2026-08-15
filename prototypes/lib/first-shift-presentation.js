export const FIRST_SHIFT_STAGES={intro:'intro',live:'live',tools:'tools'};

const stageClasses={
  intro:['guided-intro'],
  live:['shift-live'],
  tools:['shift-live','management-ready']
};

export function applyFirstShiftStage(root,stage){
  if(!stageClasses[stage])throw new Error(`Unknown first-shift stage: ${stage}`);
  for(const name of new Set(Object.values(stageClasses).flat()))root.classList.remove(name);
  root.classList.add(...stageClasses[stage]);
  root.dataset.firstShiftStage=stage;
  return stageClasses[stage].slice();
}
