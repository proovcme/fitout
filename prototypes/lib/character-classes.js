export const WORK_TYPES={
  supervise:{id:'supervise',label:'Контролировать работы',animation:'idle',trade:'management',station:'desk'},
  plan_project:{id:'plan_project',label:'Планировать объект',animation:'idle',trade:'management',station:'desk'},
  negotiate:{id:'negotiate',label:'Согласовывать решения',animation:'idle',trade:'management',station:'meeting'},
  request_change:{id:'request_change',label:'Менять требования',animation:'idle',trade:'client',station:'meeting'},
  inspect_work:{id:'inspect_work',label:'Проверять и принимать',animation:'idle',trade:'inspection',station:'inspection'},
  drawings:{id:'drawings',label:'Выпускать чертежи',animation:'idle',trade:'design',station:'desk'},
  concept_design:{id:'concept_design',label:'Прорабатывать планировку',animation:'idle',trade:'architecture',station:'desk'},
  author_supervision:{id:'author_supervision',label:'Вести авторский надзор',animation:'idle',trade:'architecture',station:'inspection'},
  drill_wall:{id:'drill_wall',label:'Сверлить стену',animation:'drill',trade:'electrical',station:'wall'},
  install_socket:{id:'install_socket',label:'Ставить розетки',animation:'drill',trade:'electrical',station:'socket'},
  assemble_panel:{id:'assemble_panel',label:'Собирать щит',animation:'hammer',trade:'electrical',station:'panel'},
  install_plumbing:{id:'install_plumbing',label:'Монтировать сантехнику',animation:'hammer',trade:'plumbing'},
  install_pipes:{id:'install_pipes',label:'Монтировать трубы',animation:'drill',trade:'plumbing'},
  paint_wall:{id:'paint_wall',label:'Красить стены',animation:'hammer',trade:'finishing'},
  carry_materials:{id:'carry_materials',label:'Носить материалы',animation:'carry',trade:'general',station:'materials'},
  cleanup:{id:'cleanup',label:'Убирать мусор',animation:'carry',trade:'general',station:'debris'},
  rest:{id:'rest',label:'Сидеть без задачи',animation:'idle',trade:'idle',station:'chair'},
  smoke:{id:'smoke',label:'Курить и обсуждать сроки',animation:'smoke',trade:'idle'}
};

export const REPORTING_CHAIN={worker:'foreman',electrician:'foreman',plumber:'foreman',hvac:'foreman',finisher:'foreman',foreman:'project_manager',designer:'project_manager',architect:'project_manager',engineer:'project_manager',inspector:'project_manager',client:null,project_manager:null};

export const CHARACTER_CLASSES={
  project_manager:{id:'project_manager',label:'Руководитель проекта',icon:'♛',primary:['plan_project','negotiate','supervise'],secondary:['inspect_work'],forbidden:['drawings','drill_wall','paint_wall','install_socket','assemble_panel','install_plumbing','install_pipes','carry_materials','cleanup'],workBias:.92,breakBias:.08},
  client:{id:'client',label:'Заказчик',icon:'₽',primary:['request_change','inspect_work'],secondary:['negotiate'],forbidden:['drawings','drill_wall','paint_wall','install_socket','assemble_panel','install_plumbing','install_pipes','carry_materials','cleanup'],workBias:.72,breakBias:.28},
  foreman:{id:'foreman',label:'Прораб',icon:'◆',primary:['supervise'],secondary:['carry_materials'],forbidden:['drawings','paint_wall','install_socket','assemble_panel'],workBias:.86,breakBias:.14},
  designer:{id:'designer',label:'Проектировщик',icon:'✎',primary:['drawings'],secondary:['concept_design','supervise'],forbidden:['drill_wall','paint_wall','install_socket','assemble_panel','install_plumbing','install_pipes','carry_materials','cleanup'],workBias:.9,breakBias:.1},
  architect:{id:'architect',label:'Архитектор',icon:'△',primary:['concept_design','author_supervision'],secondary:['drawings','supervise'],forbidden:['drill_wall','paint_wall','install_socket','assemble_panel','install_plumbing','install_pipes','carry_materials','cleanup'],workBias:.88,breakBias:.12},
  electrician:{id:'electrician',label:'Электрик',icon:'ϟ',primary:['drill_wall','install_socket','assemble_panel'],secondary:['carry_materials'],forbidden:['paint_wall','drawings'],workBias:.82,breakBias:.18},
  plumber:{id:'plumber',label:'Сантехник',icon:'◉',primary:['install_plumbing','install_pipes','drill_wall'],secondary:['carry_materials'],forbidden:['drawings','paint_wall','install_socket','assemble_panel'],workBias:.8,breakBias:.2},
  inspector:{id:'inspector',label:'Технадзор',icon:'✓',primary:['inspect_work'],secondary:['supervise'],forbidden:['drawings','drill_wall','paint_wall','install_socket','assemble_panel','install_plumbing','install_pipes','carry_materials','cleanup'],workBias:.84,breakBias:.16},
  finisher:{id:'finisher',label:'Отделочник',icon:'▨',primary:['paint_wall'],secondary:['drill_wall','carry_materials','cleanup'],forbidden:['drawings','install_socket','assemble_panel'],workBias:.78,breakBias:.22},
  worker:{id:'worker',label:'Подсобник',icon:'↔',primary:['carry_materials','cleanup'],secondary:['drill_wall','paint_wall'],forbidden:['drawings','install_socket','assemble_panel'],workBias:.66,breakBias:.34},
  engineer:{id:'engineer',label:'Инженер ПТО',icon:'▤',primary:['drawings','supervise'],secondary:[],forbidden:['drill_wall','paint_wall','install_socket','assemble_panel','carry_materials'],workBias:.88,breakBias:.12},
  hvac:{id:'hvac',label:'Монтажник ОВиК',icon:'≈',primary:['drill_wall'],secondary:['carry_materials'],forbidden:['drawings','paint_wall','install_socket','assemble_panel'],workBias:.8,breakBias:.2}
};

export function workCapability(classId,workId,{allowOffProfile=false}={}){
  const actorClass=CHARACTER_CLASSES[classId],work=WORK_TYPES[workId];
  if(!actorClass||!work)return{allowed:false,efficiency:0,reason:'unknown'};
  if(work.trade==='idle')return{allowed:true,efficiency:1,reason:'idle'};
  if(actorClass.primary.includes(workId))return{allowed:true,efficiency:1,reason:'primary'};
  if(actorClass.secondary.includes(workId))return{allowed:true,efficiency:.58,reason:'secondary'};
  if(actorClass.forbidden.includes(workId))return allowOffProfile?{allowed:true,efficiency:.24,reason:'forced'}:{allowed:false,efficiency:0,reason:'forbidden'};
  return allowOffProfile?{allowed:true,efficiency:.32,reason:'forced'}:{allowed:false,efficiency:0,reason:'not_profile'};
}

export function eligibleWork(classId,points,options){return points.filter(point=>workCapability(classId,point.workId,options).allowed)}

export function describeCapability(classId,workId){const result=workCapability(classId,workId),actor=CHARACTER_CLASSES[classId]?.label||classId,work=WORK_TYPES[workId]?.label||workId;if(!result.allowed)return`${actor}: «${work}» — запрещено классом`;if(result.reason==='secondary')return`${actor}: «${work}» — помощь, ${Math.round(result.efficiency*100)}%`;return`${actor}: «${work}» — профиль, ${Math.round(result.efficiency*100)}%`}
