export class ContextActions{
  constructor({actor,promptElement}){this.actor=actor;this.promptElement=promptElement;this.entries=[];this.active=null}
  register({id,object,label,radius=1.5,priority=0,enabled=()=>true,action}){const entry={id,object,label,radius,priority,enabled,action};this.entries.push(entry);return entry}
  remove(id){this.entries=this.entries.filter(entry=>entry.id!==id);if(this.active?.id===id)this.active=null}
  update(){let best=null,bestDistance=Infinity;for(const entry of this.entries){if(!entry.enabled())continue;const distance=this.actor.position.distanceTo(entry.object.position);if(distance<=entry.radius&&distance<bestDistance){best=entry;bestDistance=distance}}this.active=best;this.promptElement.classList.toggle('show',Boolean(best));const label=best?(typeof best.label==='function'?best.label():best.label):'';this.promptElement.innerHTML=best?`<kbd>E</kbd><span>${label}</span>`:'';return best}
  trigger(){if(!this.active)return false;this.active.action(this.active);return true}
}
