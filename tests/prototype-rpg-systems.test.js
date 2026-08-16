import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { generateCharacter, frameRect, anchoredFrameDestination, animationBlend } from '../prototypes/lib/character-generator.js';
import { HeroLocomotion, resolveHeroDirection } from '../prototypes/lib/hero-locomotion.js';
import { ANIMATION_MANIFEST, APPEARANCE_PACKS, availablePresentations, validateAnimationManifest, validateCharacterDefinition, makeCharacterDefinition } from '../prototypes/lib/character-appearance.js';
import { GameState } from '../prototypes/lib/gameplay-systems.js';
import { OfficeFloorPlanner } from '../prototypes/lib/office-floor-planner.js';
import { ContextActions } from '../prototypes/lib/context-actions.js';
import { createCrate } from '../prototypes/lib/construction-assets.js';
import { CHARACTER_CLASSES, workCapability, eligibleWork } from '../prototypes/lib/character-classes.js';
import { NavigationGrid } from '../prototypes/lib/navigation-grid.js';
import { CharacterBrain, createScreenDirectionResolver, contextReady } from '../prototypes/lib/character-ai.js';
import { generateBiography, BIOGRAPHY_VARIANT_FLOOR } from '../prototypes/lib/character-biographies.js';
import { generateBark, commandDialogue, reportsTo, DIALOGUE_VARIANT_FLOOR } from '../prototypes/lib/character-dialogues.js';
import { generateSite, advanceRoom, generateSpatialTasks, generateSpatialEvent, validateSite } from '../prototypes/lib/spatial-generator.js';
import { MechanicsSandbox, SANDBOX_TASK_RULES } from '../prototypes/lib/mechanics-sandbox.js';
import { generateAdventureSite, validateAdventureSite, ADVENTURE_SITE_TEMPLATES } from '../prototypes/lib/adventure-site-generator.js';
import { AdventureShift, SHIFT_FRONTS } from '../prototypes/lib/adventure-shift.js';
import { PhysicalConstruction } from '../prototypes/lib/physical-construction.js';
import { SiteAttention } from '../prototypes/lib/site-attention.js';
import { depenetrate, moveWithCollisions, overlapsObstacle } from '../prototypes/lib/movement-collision.js';
import { DayOneDirector, DAY_ONE_BEATS, DIRECTOR_PHASES } from '../prototypes/lib/day-one-director.js';
import { planClickRoute, consumeReachedWaypoints, shouldReplanChase } from '../prototypes/lib/click-navigation.js';
import { ClientPhone, rankUrgencies, CLIENT_CALLS } from '../prototypes/lib/site-communications.js';
import { applyFirstShiftStage } from '../prototypes/lib/first-shift-presentation.js';
import { dbToGain, SiteAudio } from '../prototypes/lib/site-audio.js';
import { OfficeDesignSimulation, officeDesignMetrics, DEFAULT_OFFICE_LAYOUT, DEFAULT_OFFICE_FIXTURES, OFFICE_ZONE_TYPES, OFFICE_FIXTURE_TYPES } from '../prototypes/lib/office-design-simulator.js';

test('prototype character generator reproduces a worker from one seed', () => {
  const a = generateCharacter('crew-42'),
    b = generateCharacter('crew-42'),
    c = generateCharacter('crew-43');
  assert.deepEqual(a, b);
  assert.notEqual(a.id, c.id);
  assert.match(a.name, /\s/);
  assert.equal(a.traits.length, 2);
});

test('procedural biographies are deterministic, gendered and numerous', () => {
  const woman = generateCharacter('bio-woman', {
      role: 'electrician',
      appearance: { packId: 'drafted_electrician_female_v1' },
    }),
    man = generateCharacter('bio-man', { role: 'foreman' });
  assert.deepEqual(woman.biography, generateBiography('bio-woman', 'electrician', 'feminine'));
  assert.match(woman.biography.summary, /Она /);
  assert.match(man.biography.summary, /Он /);
  assert.ok(BIOGRAPHY_VARIANT_FLOOR > 10000);
  const unique = new Set(Array.from({ length: 500 }, (_, index) => generateBiography(`person-${index}`, 'foreman', 'masculine').summary));
  assert.ok(unique.size > 300);
});

test('character class and appearance are separate deterministic contracts', () => {
  const vera = generateCharacter('vera-electrician', {
      role: 'electrician',
      name: 'Вера Искрова',
      appearance: { packId: 'drafted_electrician_female_v1' },
    }),
    generatedWoman = generateCharacter('female-electrician', {
      role: 'electrician',
      appearance: { packId: 'drafted_electrician_female_v1' },
    }),
    architect = generateCharacter('architect', { role: 'architect' }),
    client = generateCharacter('client', { role: 'client' });
  assert.equal(vera.role, 'electrician');
  assert.equal(APPEARANCE_PACKS[vera.appearance.packId].genderPresentation, 'feminine');
  assert.match(generatedWoman.name, /а\s.+а$/);
  assert.equal(architect.appearance.packId, 'drafted_architect_v1');
  assert.equal(client.appearance.packId, 'drafted_client_v1');
  assert.equal(validateAnimationManifest(ANIMATION_MANIFEST).ok, true);
  assert.equal(
    validateCharacterDefinition(makeCharacterDefinition(vera), {
      classes: { electrician: {} },
    }).ok,
    true,
  );
});

test('sprite frames keep their feet anchor instead of crawling sideways', () => {
  const rect = { width: 100, height: 120 },
    target = { x: 10, y: 20, width: 200, height: 240 },
    left = anchoredFrameDestination(rect, { centerX: 42, bottom: 113 }, target),
    right = anchoredFrameDestination(rect, { centerX: 58, bottom: 113 }, target);
  assert.equal(left.x, 26);
  assert.equal(right.x, -6);
  assert.equal(left.y, right.y);
});

test('npc direction is resolved in camera space like the player direction', () => {
  const resolve = createScreenDirectionResolver({ x: -0.6, z: 0.8 }, { x: -0.8, z: -0.6 });
  assert.equal(resolve(-0.8, -0.6), 'right');
  assert.equal(resolve(0.8, 0.6), 'left');
  assert.equal(resolve(0.6, -0.8), 'front');
  assert.equal(resolve(-0.6, 0.8), 'back');
});

test('character atlas exposes eight walk frames and four work frames', () => {
  const profile = generateCharacter('eight-frames', { role: 'foreman' }),
    walk = new Set(),
    work = new Set();
  for (let time = 0; time < 1.2; time += 0.14) walk.add(frameRect('walk', 'front', time, 1600, 800, profile).frame);
  for (let time = 0; time < 1; time += 0.22) work.add(frameRect('drill', 'front', time, 1024, 1536, profile).frame);
  assert.equal(profile.animation.frames.walk, 8);
  assert.equal(walk.size, 8);
  assert.equal(work.size, 4);
  assert.equal(frameRect('idle', 'back', 0, 1200, 1200, profile).height, 300);
});

test('hero locomotion resolves eight directions and preserves a twelve-phase stride', () => {
  assert.equal(resolveHeroDirection(1, 0), 'right');
  assert.equal(resolveHeroDirection(1, -1), 'frontRight');
  assert.equal(resolveHeroDirection(-1, 1), 'backLeft');
  const locomotion = new HeroLocomotion();
  let sample;
  for (let i = 0; i < 30; i++)
    sample = locomotion.update(1 / 60, {
      speed: 2.65,
      maxSpeed: 2.65,
      direction: 'frontRight',
    });
  assert.equal(sample.direction, 'frontRight');
  assert.ok(['start', 'walk'].includes(sample.state));
  assert.ok(sample.sample12 >= 0 && sample.sample12 < 12);
  const stopping = locomotion.update(1 / 60, {
    speed: 0,
    direction: 'frontRight',
  });
  assert.equal(stopping.state, 'stop');
});

test('project manager owns a diagonal walk atlas and diagonal rows stay distinct', () => {
  const profile = generateCharacter('hero-diagonal', {
    role: 'project_manager',
  });
  assert.match(profile.atlases.walkDiagonal, /project-manager-walk-diagonal-atlas-v2\.png$/);
  assert.equal(frameRect('walk', 'frontLeft', 0, 1536, 1024, profile).y, 256);
  assert.equal(frameRect('walk', 'frontRight', 0, 1536, 1024, profile).y, 256);
  assert.equal(frameRect('walk', 'backRight', 0, 1536, 1024, profile).y, 768);
});

test('sprite animation blend math remains available for non-transparent previews', () => {
  const profile = generateCharacter('blend-frames', {
      role: 'project_manager',
    }),
    blend = animationBlend('walk', 'front', 0.075, 1600, 800, profile);
  assert.notEqual(blend.current.frame, blend.next.frame);
  assert.ok(blend.mix > 0 && blend.mix < 1);
  assert.equal(animationBlend('walk', 'front', 0, 1600, 800, profile).mix, 0);
});

test('character classes forbid absurd autonomous work and preserve trade identity', () => {
  assert.equal(workCapability('architect', 'drill_wall').allowed, false);
  assert.equal(workCapability('electrician', 'install_socket').efficiency, 1);
  assert.equal(workCapability('worker', 'drill_wall').efficiency, 0.58);
  assert.equal(workCapability('architect', 'drill_wall', { allowOffProfile: true }).efficiency, 0.24);
  const points = [{ workId: 'drawings' }, { workId: 'paint_wall' }, { workId: 'smoke' }];
  assert.deepEqual(
    eligibleWork('architect', points).map((item) => item.workId),
    ['drawings', 'smoke'],
  );
});

test('project party roles expose distinct verbs instead of one universal worker', () => {
  assert.equal(workCapability('project_manager', 'plan_project').allowed, true);
  assert.equal(workCapability('client', 'request_change').allowed, true);
  assert.equal(workCapability('designer', 'drawings').allowed, true);
  assert.equal(workCapability('plumber', 'install_pipes').allowed, true);
  assert.equal(workCapability('inspector', 'inspect_work').allowed, true);
  assert.equal(workCapability('client', 'carry_materials').allowed, false);
  assert.equal(workCapability('inspector', 'install_socket').allowed, false);
});

test('designer and architect are separate visible classes', () => {
  assert.equal(CHARACTER_CLASSES.designer.label, 'Проектировщик');
  assert.equal(CHARACTER_CLASSES.architect.label, 'Архитектор');
  assert.equal(workCapability('designer', 'drawings').efficiency, 1);
  assert.equal(workCapability('architect', 'concept_design').efficiency, 1);
  assert.equal(workCapability('designer', 'concept_design').efficiency, 0.58);
});

test('designer architect GIP GAP and inspector have distinct classes and silhouettes', () => {
  const designer = generateCharacter('designer-role', { role: 'designer' }),
    architect = generateCharacter('architect-role', { role: 'architect' }),
    gip = generateCharacter('gip-role', { role: 'gip' }),
    gap = generateCharacter('gap-role', { role: 'gap' }),
    inspector = generateCharacter('inspector-role', { role: 'inspector' });
  assert.equal(designer.appearance.packId, 'drafted_designer_male_v1');
  assert.equal(architect.appearance.packId, 'drafted_architect_v1');
  assert.equal(gip.appearance.packId, 'drafted_gip_v1');
  assert.equal(gap.appearance.packId, 'drafted_gap_v1');
  assert.equal(inspector.appearance.packId, 'drafted_inspector_v1');
  assert.equal(workCapability('gip', 'coordinate_design').efficiency, 1);
  assert.equal(workCapability('gap', 'approve_architecture').efficiency, 1);
});

test('helmet color communicates trade while accent customizes clothing', () => {
  const foreman = generateCharacter('white-helmet', { role: 'foreman' }),
    electrician = generateCharacter('blue-helmet', {
      role: 'electrician',
      appearance: {
        packId: 'drafted_electrician_female_v1',
        accentTone: '#c45783',
      },
    });
  assert.equal(foreman.appearance.packId, 'drafted_foreman_white_v1');
  assert.equal(foreman.appearance.helmetTone, '#f4f5ef');
  assert.equal(electrician.appearance.helmetTone, '#2878c7');
  assert.equal(electrician.appearance.accentTone, '#c45783');
  assert.notEqual(electrician.appearance.helmetTone, electrician.appearance.accentTone);
});

test('available gender presentation follows real asset packs instead of profession logic', () => {
  assert.deepEqual(availablePresentations('worker'), ['masculine']);
  assert.deepEqual(availablePresentations('electrician'), ['masculine', 'feminine']);
  const beard = generateCharacter('worker-a', { role: 'worker' }),
    clean = generateCharacter('worker-b', { role: 'worker' });
  assert.ok(['drafted_builder_v1', 'drafted_worker_clean_v1'].includes(beard.appearance.packId));
  assert.ok(['drafted_builder_v1', 'drafted_worker_clean_v1'].includes(clean.appearance.packId));
  assert.equal(generateCharacter('boss', { role: 'project_manager' }).appearance.packId, 'drafted_project_manager_v1');
});

test('navigation grid routes around a blocked wall and returns reachable targets', () => {
  const grid = new NavigationGrid({
    minX: 0,
    maxX: 4,
    minZ: 0,
    maxZ: 4,
    cellSize: 1,
    blocked: [{ x: 2, z: 1.5, width: 1, depth: 3, padding: 0 }],
  });
  const path = grid.findPath({ x: 0, z: 0 }, { x: 4, z: 0 });
  assert.ok(path.length > 5);
  assert.equal(
    path.some((point) => point.x === 2 && point.z <= 3),
    false,
  );
  assert.equal(grid.reachable({ x: 0, z: 0 }, [{ x: 4, z: 0 }]).length, 1);
});

test('click navigation turns a touch into a wall-avoiding route', () => {
  const grid = new NavigationGrid({
      minX: 0,
      maxX: 8,
      minZ: 0,
      maxZ: 8,
      cellSize: 1,
      blocked: [{ x: 4, z: 4, width: 1, depth: 5, padding: 0.2 }],
    }),
    plan = planClickRoute(grid, { x: 1, z: 4 }, { x: 7, z: 4 });
  assert.equal(plan.ok, true);
  assert.ok(plan.waypoints.length > 6);
  assert.ok(plan.waypoints.some((point) => point.z <= 1 || point.z >= 7));
  const mutable = plan.waypoints.map((point) => ({ ...point })),
    before = mutable.length,
    first = mutable[0];
  consumeReachedWaypoints(mutable, first);
  assert.ok(mutable.length < before);
});

test('action navigation approaches a moving target without occupying its cell', () => {
  const grid = new NavigationGrid({
      minX: 0,
      maxX: 8,
      minZ: 0,
      maxZ: 8,
      cellSize: 0.5,
      blocked: [{ x: 4, z: 3.5, width: 0.3, depth: 5, padding: 0.34 }],
    }),
    from = { x: 1, z: 4 },
    firstTarget = { x: 5, z: 4 },
    first = planClickRoute(grid, from, firstTarget, {
      approachRadius: 0.8,
      maxApproachDistance: 1.15,
    });
  assert.equal(first.ok, true);
  assert.ok(Math.hypot(first.endpoint.x - firstTarget.x, first.endpoint.z - firstTarget.z) <= 1.15);
  assert.notDeepEqual(first.endpoint, firstTarget);
  const movedTarget = { x: 5, z: 5 },
    second = planClickRoute(grid, first.endpoint, movedTarget, {
      approachRadius: 0.8,
      maxApproachDistance: 1.15,
    });
  assert.equal(second.ok, true);
  assert.ok(Math.hypot(second.endpoint.x - movedTarget.x, second.endpoint.z - movedTarget.z) <= 1.15);
  assert.equal(
    shouldReplanChase({
      elapsed: 0.5,
      target: movedTarget,
      destination: firstTarget,
    }),
    true,
  );
  assert.equal(
    shouldReplanChase({
      elapsed: 0.1,
      stalledFor: 0.3,
      target: firstTarget,
      destination: firstTarget,
    }),
    true,
  );
  assert.equal(
    shouldReplanChase({
      elapsed: 0.1,
      target: firstTarget,
      destination: firstTarget,
    }),
    false,
  );
});

test('first shift reveals management UI in deliberate stages', () => {
  const classes = new Set(),
    root = {
      classList: {
        add(...names) {
          for (const name of names) classes.add(name);
        },
        remove(name) {
          classes.delete(name);
        },
      },
      dataset: {},
    };
  assert.deepEqual(applyFirstShiftStage(root, 'intro'), ['guided-intro']);
  assert.equal(root.dataset.firstShiftStage, 'intro');
  assert.deepEqual(applyFirstShiftStage(root, 'live'), ['shift-live']);
  assert.equal(classes.has('guided-intro'), false);
  assert.deepEqual(applyFirstShiftStage(root, 'tools'), ['shift-live', 'management-ready']);
  assert.equal(classes.has('management-ready'), true);
  assert.throws(() => applyFirstShiftStage(root, 'spreadsheet'));
});

test('site audio uses decibel buses and stays inert without an audio context', () => {
  assert.ok(Math.abs(dbToGain(-6) - 0.501) < 0.002);
  const audio = new SiteAudio();
  assert.equal(audio.play('small'), false);
  assert.equal(audio.context, null);
});

test('office brief turns eight editable modules and engineering fixtures into measurable design intent', () => {
  const metrics = officeDesignMetrics(DEFAULT_OFFICE_LAYOUT, DEFAULT_OFFICE_FIXTURES);
  assert.equal(DEFAULT_OFFICE_LAYOUT.length, 8);
  assert.ok(Object.keys(OFFICE_ZONE_TYPES).length >= 7);
  assert.ok(Object.keys(OFFICE_FIXTURE_TYPES).length >= 4);
  assert.equal(metrics.briefPassed, true);
  assert.ok(metrics.seats >= 24);
  assert.ok(metrics.meeting >= 8);
  assert.ok(metrics.restrooms >= 1);
  assert.ok(metrics.servers >= 1);
  assert.ok(metrics.lights >= 8);
  assert.ok(metrics.sockets >= 10);
  const unsafe = [...DEFAULT_OFFICE_LAYOUT];
  unsafe[unsafe.length - 1] = 'storage';
  assert.equal(
    officeDesignMetrics(unsafe, DEFAULT_OFFICE_FIXTURES).risks.some((item) => item.id === 'egress'),
    true,
  );
  const unfurnished = DEFAULT_OFFICE_FIXTURES.map((item) => ({ ...item }));
  unfurnished[0].furniture = false;
  assert.ok(officeDesignMetrics(DEFAULT_OFFICE_LAYOUT, unfurnished).seats < metrics.seats);
});

test('design tools place rooms and cycle physical services before issue', () => {
  const design = new OfficeDesignSimulation('tools');
  assert.equal(design.applyTool(0, 'restroom'), true);
  assert.equal(design.snapshot().layout[0], 'restroom');
  const before = design.snapshot().fixtures[0];
  assert.equal(design.applyTool(0, 'furniture'), true);
  assert.equal(design.snapshot().fixtures[0].furniture, !before.furniture);
  assert.equal(design.applyTool(0, 'light'), true);
  assert.equal(design.snapshot().fixtures[0].light, (before.light + 1) % 3);
  assert.equal(design.applyTool(0, 'socket'), true);
  assert.equal(design.snapshot().fixtures[0].socket, (before.socket + 1) % 4);
  design.release();
  assert.equal(design.applyTool(0, 'server'), false);
});

test('office reality preserves a deterministic causal trail in physical build order', () => {
  const first = new OfficeDesignSimulation('bankrot-office'),
    same = new OfficeDesignSimulation('bankrot-office');
  assert.equal(first.cycleCell(0), true);
  assert.equal(first.cycleCell(0), true);
  same.cycleCell(0);
  same.cycleCell(0);
  const released = first.release(),
    sameReleased = same.release();
  assert.deepEqual(released.incidents, sameReleased.incidents);
  assert.deepEqual(
    first.snapshot().incidents.map((item) => item.job),
    [...first.snapshot().incidents.map((item) => item.job)].sort((a, b) => ['partition', 'engineering', 'finish', 'furniture'].indexOf(a) - ['partition', 'engineering', 'finish', 'furniture'].indexOf(b)),
  );
  assert.equal(first.setCell(0, 'work'), false);
  while (first.pending()) {
    const option = first.pending().options.at(-1);
    assert.equal(first.resolve(option.id).ok, true);
  }
  assert.equal(first.snapshot().phase, 'complete');
  assert.equal(first.snapshot().resolved.length, 3);
  assert.ok(first.snapshot().chaos > 8);
  assert.ok(first.snapshot().fidelity < 100);
  assert.equal(new Set(first.snapshot().deviations).size, first.snapshot().deviations.length);
});

test('chapter turns the timed rich plan into a playable construction site on the same field', () => {
  const chapter = readFileSync(new URL('../prototypes/fitout-chapter-one.html', import.meta.url), 'utf8');
  for (const token of ['designButton', 'designPlanGrid', 'designRealityGrid', 'new OfficeDesignSimulation', 'design-furniture', 'designToolbox', 'designSprintRemaining=FITOUT_DESIGN_SECONDS', 'issueOfficeDesign', 'issuedSceneActive', 'issuedOfficeParts', 'SiteWorkBoard', 'SiteWorkerBrain', 'syncIssuedWorkforce', 'construction.setProgress', 'issued-demolition', 'issued-materials', 'issued-incident', 'ВАШ ОФИС · СТРОИТСЯ', 'officeFloor.snapshot()', 'build_office', 'startOfficeCommissioning', 'updateOfficeCommissioning', 'analyzeOfficeCommissioning', 'resultScore', 'ОЧКОВ']) assert.match(chapter, new RegExp(token));
  for (const role of ["role:'architect'", "role:'gip'", "id:'architect'", "id:'gip'"]) assert.match(chapter, new RegExp(role));
  assert.match(chapter, /siteCast=\[semyon\.group,boris\.group,vera\.group,architect\.group,gip\.group,client\.group,inspector\.group\],livingCast=\[\.\.\.siteCast,\.\.\.officeUsers\.map/);
  assert.match(chapter, /issuedSceneHidden\.push\(child\);child\.visible=false/);
  assert.match(chapter, /wallProgress.*networkProgress.*furnitureProgress/);
  assert.match(chapter, /desiredFocus\.copy\(player\.position\)/);
  assert.doesNotMatch(chapter, /issuedOfficeBuildTime\/14/);
  assert.doesNotMatch(chapter, /addIssuedWorker/);
  assert.doesNotMatch(chapter, /Идите к старой перегородке и откройте первый физический фронт/);
});

test('issued construction asks the player to inspect visible work instead of only waiting', () => {
  const chapter = readFileSync(new URL('../prototypes/fitout-chapter-one.html', import.meta.url), 'utf8');
  for (const token of ['issuedCheckDefinitions', 'resolveIssuedCheck', 'axis_not_verified', 'doorway_not_verified', 'finish_sample_not_verified', 'furniture_clearance_not_verified', 'showIssuedDecision', 'issued-decision-fix', 'issued-decision-risk', '✓ ПРОВЕРЕНО', '⚠ ПРИНЯТО С РИСКОМ']) assert.match(chapter, new RegExp(token));
  assert.match(chapter, /liveWorking\.progress>=\.45/);
  assert.match(chapter, /construction\.pause\(liveWorking\.id\)/);
  assert.match(chapter, /construction\.resume\(id,\{speed:safe/);
  assert.match(chapter, /shift\.score\+=4/);
  assert.match(chapter, /part\.material\.color|wall\.material\.color/);
});

test('issued office disables every obsolete physical front from the old prototype', () => {
  const chapter = readFileSync(new URL('../prototypes/fitout-chapter-one.html', import.meta.url), 'utf8');
  for (const id of ['physical-demolition', 'physical-partition', 'physical-engineering', 'physical-finish', 'physical-furniture']) assert.match(chapter, new RegExp(`id:'${id}'.*enabled:\\(\\)=>!issuedSceneActive`));
});

test('issued office has one construction simulation instead of the legacy loop running underneath', () => {
  const chapter = readFileSync(new URL('../prototypes/fitout-chapter-one.html', import.meta.url), 'utf8');
  assert.match(chapter, /if\(!issuedSceneActive\)\{shift\.tick\(dt\);updateAttention\(dt\);updatePhysicalConstruction\(dt\)/);
  assert.match(chapter, /gameplayObjects=\[foremanDesk,projectDesk,moveMarker,routeGuide,issuedPriorityFlag\]/);
  assert.match(chapter, /trashHazard\.visible=false;wetCableHazard\.visible=false/);
  assert.match(chapter, /function updateUrgencyHud\(\)\{const issue=currentUrgencies\(\)\[0\];if\(issuedSceneActive\|\|/);
});

test('issued objective always offers a touch route to the highest-priority visible front', () => {
  const chapter = readFileSync(new URL('../prototypes/fitout-chapter-one.html', import.meta.url), 'utf8');
  assert.match(chapter, /questRouteButton\.textContent='ИДТИ К МЕТКЕ →'/);
  assert.match(chapter, /\.issued-build \.quest-route\{display:block\}/);
  assert.match(chapter, /function routeToIssuedFront\(\)/);
  assert.match(chapter, /entry\.id\.startsWith\('issued-'\)/);
  assert.match(chapter, /sort\(\(a,b\)=>b\.priority-a\.priority\)/);
  assert.match(chapter, /planPlayerRoute\(target,action\)/);
});

test('issued construction keeps routine decisions in the world and dialogue close labels stay neutral', () => {
  const chapter = readFileSync(new URL('../prototypes/fitout-chapter-one.html', import.meta.url), 'utf8'),
    systems = readFileSync(new URL('../prototypes/lib/gameplay-systems.js', import.meta.url), 'utf8');
  for (const token of ['acceptIssuedMaterials', 'acceptIssuedPanel', 'Проверить поставку на месте', 'Проверить маркировку щита', 'Перенести розетку до зашивки', 'Отбить ось по плану', 'Проверить проём и расширить', 'Сверить образец при рабочем свете', 'Переставить по плану']) assert.match(chapter, new RegExp(token));
  assert.match(chapter, /action:acceptIssuedMaterials/);
  assert.match(chapter, /action:acceptIssuedPanel/);
  assert.match(systems, /line\.nextLabel\|\|\(this\.index===this\.lines\.length-1\?'Закрыть':'Продолжить'\)/);
  assert.doesNotMatch(systems, /Понятно\. Наверное/);
});

test('chapter exposes project design from the menu and throughout the construction shift', () => {
  const chapter = readFileSync(new URL('../prototypes/fitout-chapter-one.html', import.meta.url), 'utf8');
  assert.match(chapter, /class="main-menu-button" href="\.\.\/">МЕНЮ/);
  assert.match(chapter, /id="designButton"[^>]*>СПРОЕКТИРОВАТЬ ОФИС/);
  assert.match(chapter, /new URLSearchParams\(window\.location\.search\)\.get\('mode'\)/);
  assert.match(chapter, /launchMode==='design'.*openOverlay\(officeDesign\)/);
  assert.ok(chapter.indexOf("launchMode==='design'") < chapter.indexOf('await loadCharacterAtlases'), 'design must open before remote character assets finish loading');
  assert.doesNotMatch(chapter, /guided-intro \.design-button/);
  assert.doesNotMatch(chapter, /shift-live:not\(\.management-ready\) \.design-button/);
});

test('project design draws connected rooms with touch or auto project and releases the same office into 3d', () => {
  const chapter = readFileSync(new URL('../prototypes/fitout-chapter-one.html', import.meta.url), 'utf8');
  for (const token of ['new OfficeFloorPlanner', 'floor-grid', 'floor-cell', 'paintRect', 'placeItem', 'toggleNetwork', 'pointerdown', 'pointermove', 'pointercancel', 'setPointerCapture', 'elementFromPoint', 'КОМНАТЫ', 'МЕБЕЛЬ', 'СЕТИ', 'ВЫПУСК', 'ВХОД', 'Коридор', 'design-handoff', 'Чертёж превращается в стройку', 'Теперь это будут строить', 'handoff-room', 'playDesignHandoff', 'issuedOffice3D', 'buildIssuedOffice3D', 'updateIssuedOffice3D', 'addIssuedFurniture', 'designAutoButton', 'officeFloor.snapshot()', 'ВАШ ОФИС · СТРОИТСЯ']) assert.match(chapter, new RegExp(token));
  assert.match(chapter,/officeFloor\.autoPlan\(\{variant:fitoutScenario\.layout\.id\}\)/);
  assert.match(chapter, /touch-action:none!important/);
  assert.match(chapter, /designReleaseButton\.disabled=!snapshot\.complete/);
  assert.match(chapter, /syncOfficeFloorToSimulation\(\);const result=officeDesignSim\.release/);
  assert.match(chapter, /buildIssuedOffice3D\(\);game\.setFlag\('office_design_released'/);
  assert.match(chapter, /playDesignHandoff\(\(\)=>\{closeOverlay\(officeDesign\)/);
  assert.match(chapter, /row\*officeFloor\.cols\+col/);
  assert.match(chapter, /cell\.entrance/);
  assert.match(chapter, /cell\.item/);
  assert.match(chapter, /cell\.light/);
  assert.match(chapter, /cell\.socket/);
});

test('floor planner supports Evil Genius style rectangular rooms, furniture and utilities', () => {
  const plan = new OfficeFloorPlanner({ cols: 12, rows: 8 });
  assert.equal(plan.paintRect(0, 26, 'work'), true);
  assert.equal(plan.metrics().roomArea.work, 9);
  assert.equal(plan.placeItem(0, 'desk'), true);
  assert.equal(plan.placeItem(1, 'desk'), true);
  assert.equal(plan.placeItem(2, 'desk'), true);
  assert.equal(plan.metrics().seats, 12);
  assert.equal(plan.paintRect(36, 41, 'meeting'), true);
  assert.equal(plan.metrics().roomArea.meeting, 6);
  assert.equal(plan.placeItem(36, 'meetingTable'), true);
  assert.equal(plan.placeItem(0, 'toilet'), false);
  assert.equal(plan.toggleNetwork(0, 'light'), true);
  assert.equal(plan.toggleNetwork(0, 'socket'), true);
  assert.deepEqual(plan.rectangle(0, 13), [0, 1, 12, 13]);
  assert.equal(plan.erase(13), true);
  assert.equal(plan.snapshot().cells[13].room, null);
});

test('auto project creates a complete editable office connected to the permanent entrance', () => {
  const plan = new OfficeFloorPlanner({ cols: 12, rows: 8 }),
    snapshot = plan.autoPlan(),
    entrance = snapshot.cells[snapshot.entranceIndex];
  assert.equal(snapshot.complete, true);
  assert.equal(entrance.entrance, true);
  assert.equal(entrance.room, 'corridor');
  assert.equal(snapshot.metrics.connectivity.complete, true);
  assert.ok(snapshot.metrics.seats >= 12);
  assert.ok(snapshot.metrics.networks.light >= 6);
  assert.ok(snapshot.metrics.networks.socket >= 6);
  assert.ok(snapshot.metrics.networks.door >= 6);
  assert.equal(plan.erase(snapshot.entranceIndex), false);
  assert.equal(plan.paintRect(0, 0, 'work'), true);
});

test('floor planner always preserves an entrance and blocks release until its corridor reaches every room', () => {
  const plan = new OfficeFloorPlanner({ cols: 6, rows: 5, entranceIndex: 27 });
  assert.equal(plan.snapshot().cells[27].entrance, true);
  assert.equal(plan.snapshot().cells[27].room, 'corridor');
  assert.equal(plan.erase(27), false);
  assert.equal(plan.paintRect(27, 27, 'work'), true);
  assert.equal(plan.snapshot().cells[27].room, 'corridor');
  for (const [start, end, room] of [
    [0, 2, 'work'],
    [6, 8, 'meeting'],
    [12, 14, 'restroom'],
    [18, 20, 'server'],
  ])
    plan.paintRect(start, end, room);
  assert.equal(plan.connectivity().complete, false);
  plan.paintRect(3, 27, 'corridor');
  const connected = plan.connectivity();
  assert.equal(connected.total, 4);
  assert.equal(connected.connected, 4);
  assert.equal(connected.complete, true);
  assert.equal(plan.requirements().find((item) => item.id === 'circulation').complete, true);
  plan.erase(15);
  assert.equal(plan.connectivity().complete, false);
});

test('connected rooms receive real corridor doors before construction', () => {
  const plan = new OfficeFloorPlanner({ cols: 6, rows: 5, entranceIndex: 27 });
  for (const [start, end, room] of [
    [0, 2, 'work'],
    [6, 8, 'meeting'],
    [12, 14, 'restroom'],
    [18, 20, 'server'],
  ])
    plan.paintRect(start, end, room);
  plan.paintRect(3, 27, 'corridor');
  assert.equal(plan.addConnectionDoors(), 4);
  const snapshot = plan.snapshot();
  assert.equal(snapshot.metrics.networks.door, 5);
  for (const component of snapshot.metrics.connectivity.components) assert.ok(component.cells.some((index) => snapshot.cells[index].door));
});

test('context action waits for a completed click and the first quest exposes its real target', () => {
  const chapter = readFileSync(new URL('../prototypes/fitout-chapter-one.html', import.meta.url), 'utf8');
  assert.match(chapter, /touchActionButton\.addEventListener\('click'/);
  assert.match(chapter, /contextActions\.promptElement\.addEventListener\('click'/);
  assert.doesNotMatch(chapter, /contextActions\.promptElement\.addEventListener\('pointerdown'/);
  assert.match(chapter, /РУЛЕТКА · ОТКРЫТЬ ЯЩИК/);
  assert.match(chapter, /id:'crate'.*priority:10/);
  assert.match(chapter, /b\.entry\.priority.*a\.entry\.priority/);
  assert.match(chapter, /maxApproachDistance:action\?action\.radius:Infinity/);
});

test('iPad owns an analog movement action and the issued site keeps the illustrated cast at human scale', () => {
  const chapter = readFileSync(new URL('../prototypes/fitout-chapter-one.html', import.meta.url), 'utf8');
  for (const token of ['id="touchMovePad"', 'id="touchMoveKnob"', 'inputActions={move:', 'readTouchMove', 'releaseTouchMove', "'pointermove'", "'pointercancel'", 'setPointerCapture', 'touchActive', 'coarsePointer.matches?.74:.82', 'issuedCellSize=1.25', 'issuedActorScale=.78', 'wallHeight=2.35', 'lerp(issuedOffice3D.position,.72)', 'player.scale.setScalar(issuedActorScale)', 'actor.scale.setScalar(issuedActorScale)', 'new THREE.BoxGeometry(1.05,.06,.62)', 'new THREE.BoxGeometry(.56,1.9,.58)', 'syncIssuedWorkforce', 'semyon.group', 'boris.group', 'vera.group']) assert.match(chapter, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(chapter, /tablet-controls \.touch-action,.tablet-controls \.move-stick/);
  assert.match(chapter, /touchMove\.y:keyboardY/);
  assert.match(chapter, /issuedFronts\[id\],radius:1\.65,priority:20/);
  assert.match(chapter, /issuedFronts\.materials,radius:1\.8,priority:22/);
  assert.match(chapter, /issuedFronts\.incident,radius:1\.8,priority:30/);
  assert.doesNotMatch(chapter, /worker\.userData=\{index,arms\}/);
  assert.doesNotMatch(chapter, /furnitureProgress[^\n]*\*2\.15/);
});

test('issued-site AI routes every role through real door gaps and built-wall collisions', () => {
  const chapter = readFileSync(new URL('../prototypes/fitout-chapter-one.html', import.meta.url), 'utf8'),
    workforce = readFileSync(new URL('../prototypes/lib/site-workforce.js', import.meta.url), 'utf8');
  for (const token of ['officeFloor.addConnectionDoors()', 'doorwayBetween', 'issuedOfficeParts.wallRects', 'syncIssuedCollisions(wallProgress)', 'new SiteWorkerBrain', 'issuedWorkerBrains', 'navigation', 'move:(actor,delta)=>moveActor(actor,delta,.19)', 'directionResolver:npcDirection']) assert.match(chapter, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(workforce, /this\.navigation\.findPath/);
  assert.match(workforce, /this\.move\(this\.actor/);
  assert.match(chapter, /wallsBuilt\?issuedOfficeParts\.wallRects:\[\]/);
  assert.match(chapter, /current\.door\|\|neighbor\.door/);
});

test('raised walls cut away between the camera and every visible character', () => {
  const chapter = readFileSync(new URL('../prototypes/fitout-chapter-one.html', import.meta.url), 'utf8');
  assert.match(chapter, /function collectWallOccluders\(items,target,occluding,spread=\.42\)/);
  assert.match(chapter, /for\(const npc of\[semyon,boris,vera,architect,gip,client,inspector,\.\.\.officeUsers\]\)/);
  assert.match(chapter, /collectWallOccluders\(issuedOfficeParts\.walls,heroHead,issuedOccluding,0\)/);
  assert.match(chapter, /hiddenOpacity:\.06,restingOpacity:\.72/);
});

test('public release loads the engine in parallel and caches immutable hashed assets', () => {
  const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8'),
    route = readFileSync(new URL('../scripts/install-locia-game-route.py', import.meta.url), 'utf8');
  assert.match(vite, /moduleId\.includes\('\/node_modules\/three\/'\).*return 'three'/);
  assert.match(route, /@fitout_assets path \/assets\/\*/);
  assert.match(route, /public, max-age=31536000, immutable/);
  assert.match(route, /@fitout_documents not path \/assets\/\*/);
  assert.match(route, /Cache-Control \"no-store\"/);
});

test('client calls interrupt the shift once and wait for a real answer', () => {
  const phone = new ClientPhone();
  assert.ok(CLIENT_CALLS.length >= 3);
  assert.equal(phone.tick(51), null);
  const call = phone.tick(1);
  assert.equal(call.id, 'first-status');
  assert.equal(phone.tick(100), null);
  assert.equal(phone.answer('not-a-choice'), null);
  assert.deepEqual(phone.answer('honest'), {
    callId: 'first-status',
    choice: 'honest',
  });
  assert.equal(phone.snapshot().active, null);
});

test('site urgency ranks danger before proximity and reports running distance', () => {
  const ranked = rankUrgencies(
    [
      { id: 'near', severity: 1, position: { x: 1, z: 0 } },
      { id: 'danger', severity: 4, position: { x: 8, z: 0 } },
      { id: 'done', severity: 9, active: false, position: { x: 0, z: 0 } },
    ],
    { x: 0, z: 0 },
  );
  assert.deepEqual(
    ranked.map((item) => item.id),
    ['danger', 'near'],
  );
  assert.equal(ranked[0].distance, 8);
});

test('bot navigation can replace demolished walls with newly built geometry', () => {
  const grid = new NavigationGrid({
    minX: 0,
    maxX: 4,
    minZ: 0,
    maxZ: 4,
    cellSize: 1,
    blocked: [{ x: 2, z: 1.5, width: 1, depth: 3, padding: 0 }],
  });
  const around = grid.findPath({ x: 0, z: 1 }, { x: 4, z: 1 });
  assert.ok(around.length > 5);
  grid.setBlockedRects([]);
  const direct = grid.findPath({ x: 0, z: 1 }, { x: 4, z: 1 });
  assert.equal(direct.length, 5);
  grid.setBlockedRects([{ x: 2, z: 1, width: 1, depth: 1, padding: 0 }]);
  assert.ok(grid.findPath({ x: 0, z: 1 }, { x: 4, z: 1 }).length > direct.length);
});

test('actor collision slides along walls and can always move away after contact', () => {
  const walls = [{ x: 1, z: 0, width: 0.2, depth: 4 }],
    hit = moveWithCollisions({ x: 0.55, z: 0 }, { x: 0.8, z: 0.7 }, walls, {
      radius: 0.3,
    });
  assert.ok(hit.blockedX);
  assert.ok(hit.z > 0.6);
  assert.ok(hit.x < 0.61);
  const away = moveWithCollisions(hit, { x: -0.5, z: 0 }, walls, {
    radius: 0.3,
  });
  assert.ok(away.x < hit.x - 0.45);
  assert.equal(overlapsObstacle(away, walls, 0.3), false);
});

test('actors already intersecting geometry are pushed back to a walkable side', () => {
  const walls = [{ x: 0, z: 0, width: 0.3, depth: 3 }],
    fixed = depenetrate({ x: 0, z: 0.4 }, walls, 0.25);
  assert.equal(overlapsObstacle(fixed, walls, 0.25), false);
  assert.ok(Math.abs(fixed.x) > 0.39);
});

test('bot brain selects only work allowed to its class and follows the generated path', () => {
  const grid = new NavigationGrid({
      minX: 0,
      maxX: 4,
      minZ: 0,
      maxZ: 4,
      cellSize: 0.5,
    }),
    profile = generateCharacter('architect-bot', { role: 'architect' }),
    actor = { position: { x: 0, y: 0, z: 0 }, direction: 'front' },
    points = [
      {
        id: 'wall',
        workId: 'drill_wall',
        position: { x: 1, z: 0 },
        station: { kind: 'wall', object: { visible: true } },
      },
      {
        id: 'desk',
        workId: 'drawings',
        position: { x: 3, z: 0 },
        duration: 1,
        station: { kind: 'desk', object: { visible: true } },
      },
    ],
    brain = new CharacterBrain({
      profile,
      actor,
      navigation: grid,
      workPoints: points,
    });
  assert.equal(brain.target.workId, 'drawings');
  for (let i = 0; i < 300; i++) brain.update(1 / 60);
  assert.notEqual(brain.target?.workId, 'drill_wall');
});

test('work animation requires a real visible station of the right type', () => {
  assert.equal(contextReady({ workId: 'assemble_panel' }), false);
  assert.equal(
    contextReady({
      workId: 'assemble_panel',
      station: { kind: 'desk', object: { visible: true } },
    }),
    false,
  );
  assert.equal(
    contextReady({
      workId: 'assemble_panel',
      station: { kind: 'panel', object: { visible: false } },
    }),
    false,
  );
  assert.equal(
    contextReady({
      workId: 'assemble_panel',
      station: { kind: 'panel', object: { visible: true } },
    }),
    true,
  );
});

test('space generator creates valid mutable rooms tasks and contextual events', () => {
  const site = generateSite('floor-a', { stage: 'demolition' }),
    same = generateSite('floor-a', { stage: 'demolition' });
  assert.deepEqual(site, same);
  assert.equal(validateSite(site).ok, true);
  assert.equal(site.rooms.length, 6);
  const before = generateSpatialTasks(site).length,
    room = site.rooms[1],
    previous = room.stage;
  advanceRoom(site, room.id);
  assert.notEqual(room.stage, previous);
  assert.equal(site.revision, 2);
  assert.equal(generateSpatialTasks(site).length, before);
  const incident = generateSpatialEvent(site, 'event-a');
  assert.ok(incident);
  assert.ok(site.rooms.some((item) => item.id === incident.roomId));
});

test('adventure office generator places content in logical functional zones', () => {
  const site = generateAdventureSite('bankrot-chapter-one'),
    same = generateAdventureSite('bankrot-chapter-one');
  assert.deepEqual(site, same);
  assert.equal(validateAdventureSite(site).ok, true);
  assert.ok(ADVENTURE_SITE_TEMPLATES.length >= 3);
  assert.equal(site.interactables.wetCable.zone, 'engineering');
  assert.equal(site.interactables.materials.zone, 'logistics');
  assert.equal(site.interactables.supply.zone, 'entrance');
});

test('adventure shift has pressure rewards and a real win or loss condition', () => {
  const shift = new AdventureShift({ duration: 20 });
  assert.equal(Object.values(SHIFT_FRONTS).filter((item) => item.required).length, 6);
  shift.resolve('briefing');
  shift.resolve('trash');
  shift.fail('wetCable', 1);
  assert.ok(shift.pressure > 0);
  shift.resolve('wetCable');
  shift.resolve('materials');
  shift.resolve('construction');
  assert.equal(shift.status, 'playing');
  shift.resolve('door');
  assert.equal(shift.status, 'won');
  assert.ok(shift.score > 0);
  const lost = new AdventureShift({ duration: 1 });
  lost.tick(1);
  assert.equal(lost.status, 'lost');
});

test('day one director owns a broad causal beat library and deterministic pacing', () => {
  assert.ok(DAY_ONE_BEATS.length >= 20);
  assert.equal(Object.keys(DIRECTOR_PHASES).length, 4);
  const run = (seed) => {
    const director = new DayOneDirector(seed),
      events = [];
    for (let i = 0; i < 900; i++) {
      const world = {
        wetCableActive: true,
        trashActive: true,
        hazardsActive: true,
        hazardsActiveCount: 2,
        materialsChecked: false,
        panelAccepted: false,
        demolitionReady: true,
        attention: 75,
        remaining: 300 - i / 3,
        workingJobs: i > 300 ? 2 : 0,
        riskyJobs: i > 450 ? 1 : 0,
        engineeringRisk: i > 500,
        clientMarching: false,
      };
      events.push(...director.tick(1 / 3, world).map((item) => item.id));
      if (director.pendingMajor) director.resolveMajor(director.pendingMajor, { success: i % 2 === 0 });
    }
    return events;
  };
  const first = run('director-a'),
    same = run('director-a'),
    other = run('director-b');
  assert.deepEqual(first, same);
  assert.notDeepEqual(first, other);
  assert.ok(first.length >= 8);
  assert.equal(new Set(first).size, first.length);
});

test('director gives recovery after crisis and learns the project manager style', () => {
  const director = new DayOneDirector('style');
  director.record('shout', { success: false, severity: 2 });
  director.record('shout', { success: true });
  assert.equal(director.dominantStyle(), 'shout');
  assert.ok(director.authority < 72);
  assert.ok(director.trust < 52);
  director.pendingMajor = 'water-meets-copper';
  director.time = 100;
  assert.equal(director.resolveMajor('water-meets-copper', { success: true }), true);
  assert.equal(director.phase, 'observation');
  director.tick(0.1, { remaining: 200 });
  assert.equal(director.phase, 'recovery');
});

test('day one always opens with readable observation before pressure', () => {
  const director = new DayOneDirector('opening');
  for (let second = 0; second < 27; second++)
    director.tick(1, {
      hazardsActive: true,
      hazardsActiveCount: 4,
      attention: 100,
      remaining: 273,
    });
  assert.equal(director.phase, 'observation');
  director.tick(2, {
    hazardsActive: true,
    hazardsActiveCount: 4,
    attention: 100,
    remaining: 271,
  });
  assert.notEqual(director.phase, 'observation');
});

test('magic resolve has cooldown and can either buy time solve or backfire reproducibly', () => {
  const first = new DayOneDirector('magic'),
    second = new DayOneDirector('magic'),
    a = first.attemptMagic({ hazardsActive: true }),
    b = second.attemptMagic({ hazardsActive: true });
  assert.deepEqual(a, b);
  assert.equal(first.attemptMagic({ hazardsActive: true }).reason, 'cooldown');
  assert.ok(['bought_time', 'backfire', 'solved'].includes(a.outcome));
});

test('physical construction advances only through visible technological dependencies', () => {
  const build = new PhysicalConstruction();
  assert.equal(build.canStart('demolition'), true);
  assert.equal(build.start('partition').ok, false);
  build.start('demolition');
  for (let i = 0; i < 70; i++) build.tick(0.1);
  assert.equal(build.jobs.get('demolition').status, 'done');
  assert.equal(build.canStart('partition'), false);
  build.addFact('materials');
  assert.equal(build.canStart('partition'), true);
  build.start('partition');
  for (let i = 0; i < 90; i++) build.tick(0.1);
  assert.equal(build.canStart('engineering'), false);
  build.addFact('panel');
  assert.equal(build.canStart('engineering'), true);
  for (const id of ['engineering', 'finish', 'furniture']) {
    assert.equal(build.start(id).ok, true);
    for (let i = 0; i < 100; i++) build.tick(0.1);
  }
  assert.equal(build.snapshot().complete, true);
});

test('a project manager can stop accelerate personally boost and record a design deviation', () => {
  const controlled = new PhysicalConstruction();
  controlled.start('demolition', { quality: 0.9, speed: 1 });
  controlled.tick(1);
  const ordinary = controlled.jobs.get('demolition').progress;
  assert.equal(controlled.pause('demolition'), true);
  controlled.tick(1, { boosts: { demolition: 0.5 } });
  assert.equal(controlled.jobs.get('demolition').progress, ordinary);
  assert.equal(controlled.resume('demolition', { quality: 0.96 }), true);
  controlled.tick(1, { boosts: { demolition: 0.5 } });
  assert.ok(controlled.jobs.get('demolition').progress > ordinary + 1 / 6);
  assert.equal(controlled.accelerate('demolition'), true);
  assert.ok(controlled.jobs.get('demolition').quality < 0.96);
  assert.ok(controlled.jobs.get('demolition').mistakes.includes('accelerated_under_pressure'));
  assert.equal(controlled.addMistake('partition', 'design_wall_shift'), true);
  assert.equal(controlled.addMistake('partition', 'design_wall_shift'), false);
  assert.ok(controlled.jobs.get('partition').mistakes.includes('design_wall_shift'));
});

test('unattended construction creates deterministic trouble while intervention suppresses it', () => {
  const unattended = new SiteAttention();
  unattended.start();
  let events = unattended.tick(9, {
    demolitionStarted: false,
    hazardsActive: true,
  });
  assert.equal(
    events.some((event) => event.id === 'autonomous_demolition'),
    true,
  );
  const controlled = new SiteAttention();
  controlled.start();
  controlled.intervene('demolition', 'direct');
  events = controlled.tick(9, {
    demolitionStarted: false,
    hazardsActive: false,
  });
  assert.equal(
    events.some((event) => event.id === 'autonomous_demolition'),
    false,
  );
  events = controlled.tick(40, {
    demolitionDone: true,
    materialsChecked: false,
    partitionStarted: false,
    hazardsActive: false,
  });
  assert.equal(
    events.some((event) => event.id === 'risky_partition'),
    true,
  );
  const risky = new PhysicalConstruction(),
    forced = risky.forceStart('partition', { quality: 0.5 });
  assert.equal(forced.ok, true);
  assert.deepEqual(forced.missing, ['demolition', 'materials']);
  assert.equal(risky.jobs.get('partition').mistakes.length, 2);
});

test('walkable chapter owns site actions and the old excel playground redirects to it', () => {
  const chapter = readFileSync(new URL('../prototypes/fitout-chapter-one.html', import.meta.url), 'utf8'),
    legacy = readFileSync(new URL('../prototypes/mechanics-playground.html', import.meta.url), 'utf8');
  for (const action of ['foreman-orders', 'trash-hazard', 'wet-cable-hazard', 'paint-buckets', 'site-chair', 'barrier-inspect', 'supply-idle', 'client', 'inspector', 'physical-demolition', 'physical-partition', 'physical-engineering', 'physical-finish', 'physical-furniture']) assert.match(chapter, new RegExp(`id:'${action}'`));
  for (const command of ['Семён, разберись', 'Всем стоп', 'Нужен статус', 'Сделать срочно']) assert.match(chapter, new RegExp(command));
  assert.match(chapter, /class="site-chat"/);
  assert.match(chapter, /new AdventureShift/);
  assert.match(chapter, /new PhysicalConstruction/);
  assert.match(chapter, /new SiteAttention/);
  assert.match(chapter, /new DayOneDirector/);
  assert.match(chapter, /new ClientPhone/);
  assert.match(chapter, /issuePointer/);
  assert.match(chapter, /issueBadge/);
  assert.match(chapter, /data-target/);
  assert.match(chapter, /director\.tick/);
  assert.match(chapter, /director\.record/);
  assert.match(chapter, /id="magicButton"/);
  assert.match(chapter, /powerFlicker/);
  assert.match(chapter, /planClickRoute/);
  assert.match(chapter, /routeGuide/);
  assert.match(chapter, /Поручить работу Семёну/);
  assert.match(chapter, /drawCharacter/);
  assert.doesNotMatch(chapter, /drawCharacterBlended/);
  assert.match(chapter, /generateMipmaps=false/);
  assert.match(chapter, /pendingAction/);
  assert.match(chapter, /touchActionButton/);
  assert.match(chapter, /phone-device/);
  assert.match(chapter, /createNpc\(semyonProfile,\[-\.9,0,-1\.15\]/);
  assert.match(chapter, /shift\.resolved\.has\('briefing'\)&&!issuedSceneActive\)for\(const brain of brains\)brain\.update/);
  assert.doesNotMatch(chapter, /data-site-message/);
  assert.match(legacy, /location\.replace\('\.\/fitout-chapter-one\.html'\)/);
});

test('mechanics playground closes the full command work acceptance and payment loop', () => {
  const game = new MechanicsSandbox('loop-test'),
    initialCash = game.economy.cash,
    task = game.availableTasks().find((item) => item.workType === 'install_engineering'),
    person = game.people.find((item) => SANDBOX_TASK_RULES[task.workType].roles.includes(item.role));
  assert.equal(game.issueCommand(task.id, person.id, { throughSupervisor: true }).ok, true);
  for (let i = 0; i < 2000 && task.status === 'working'; i++) {
    if (game.pendingEvent) game.resolveEvent('manage');
    game.tick(0.2);
  }
  assert.equal(task.status, 'awaiting_acceptance');
  let result = game.presentTask(task.id);
  for (let tries = 0; tries < 4 && !result.accepted; tries++) {
    for (let i = 0; i < 1000 && task.status === 'working'; i++) game.tick(0.2);
    result = game.presentTask(task.id);
  }
  assert.equal(result.accepted, true);
  assert.equal(game.accepted, 1);
  assert.ok(game.economy.earned > 0);
  assert.notEqual(game.economy.cash, initialCash);
  assert.ok(game.availableTasks().some((item) => item.roomId === task.roomId));
});

test('unaccepted work may be buried for time but loses quality and produces no payment', () => {
  const game = new MechanicsSandbox('bury-test'),
    task = game.availableTasks()[0],
    person = game.people.find((item) => SANDBOX_TASK_RULES[task.workType].roles.includes(item.role)),
    beforeQuality = game.quality,
    beforeEarned = game.economy.earned;
  game.issueCommand(task.id, person.id, { throughSupervisor: true });
  for (let i = 0; i < 2000 && task.status === 'working'; i++) {
    if (game.pendingEvent) game.resolveEvent('pay');
    game.tick(0.2);
  }
  assert.equal(task.status, 'awaiting_acceptance');
  assert.equal(game.bypassAcceptance(task.id).ok, true);
  assert.equal(task.status, 'buried');
  assert.ok(game.quality < beforeQuality);
  assert.equal(game.economy.earned, beforeEarned);
});

test('playground is winnable by accepting four correctly staffed fronts in one shift', () => {
  const game = new MechanicsSandbox('winning-test');
  let guard = 0;
  while (game.status === 'playing' && game.accepted < 4 && guard++ < 10000) {
    if (game.pendingEvent) {
      game.resolveEvent('pay');
      continue;
    }
    const awaiting = game.availableTasks().find((task) => task.status === 'awaiting_acceptance');
    if (awaiting) {
      const result = game.presentTask(awaiting.id);
      if (!result.accepted) continue;
    }
    const available = game.availableTasks().find((task) => task.status === 'available');
    if (available) {
      const person = game.people.find((item) => SANDBOX_TASK_RULES[available.workType].roles.includes(item.role));
      game.issueCommand(available.id, person.id, { throughSupervisor: true });
    }
    game.tick(0.2);
  }
  assert.equal(game.status, 'won');
  assert.ok(game.day.remaining > 0);
  assert.equal(game.accepted, 4);
});

test('electrical and plumbing neglect creates a physical combined catastrophe', () => {
  const game = new MechanicsSandbox('hazard-test'),
    kinds = new Set(game.activeHazards().map((item) => item.kind));
  assert.equal(kinds.has('trash'), true);
  assert.equal(kinds.has('cable'), true);
  assert.equal(kinds.has('puddle'), true);
  assert.equal(kinds.has('electrified_puddle'), true);
  const cable = game.activeHazards().find((item) => item.kind === 'cable');
  game.resolveHazard(cable.id, 'chat');
  for (let i = 0; i < 200; i++) game.tick(0.2);
  assert.equal(cable.status, 'resolved');
  assert.equal(
    game.activeHazards().some((item) => item.kind === 'electrified_puddle'),
    false,
  );
});

test('site chat streams generated messages and project manager commands alter the scene', () => {
  const game = new MechanicsSandbox('chat-test'),
    before = game.chat.length;
  for (let i = 0; i < 80; i++) game.tick(0.2);
  assert.ok(game.chat.length > before);
  const trash = game.activeHazards().find((item) => item.kind === 'trash'),
    result = game.sendChatCommand('cleanup');
  assert.equal(result.ok, true);
  assert.equal(trash.status, 'assigned');
  assert.equal(game.chat.at(-1).tone, 'player');
  for (let i = 0; i < 100; i++) game.tick(0.2);
  assert.equal(trash.status, 'resolved');
});

test('generated speech follows class and field workers report through the foreman', () => {
  const pm = generateCharacter('pm-dialogue', { role: 'project_manager' }),
    foreman = generateCharacter('foreman-dialogue', { role: 'foreman' }),
    worker = generateCharacter('worker-dialogue', {
      role: 'worker',
      supervisorId: foreman.id,
    }),
    bark = generateBark(worker, { state: 'carry', index: 4 }),
    toForeman = commandDialogue({
      speaker: pm,
      target: foreman,
      seed: 'direct-order',
    }),
    toWorker = commandDialogue({
      speaker: pm,
      target: worker,
      seed: 'field-order',
    });
  assert.equal(reportsTo('worker'), 'foreman');
  assert.equal(reportsTo('foreman'), 'project_manager');
  assert.equal(worker.reporting.supervisorId, foreman.id);
  assert.equal(toForeman.outcome, 'accepted');
  assert.ok(['accepted', 'redirected', 'refused'].includes(toWorker.outcome));
  if (toWorker.outcome === 'redirected') assert.equal(toWorker.routedToId, foreman.id);
  assert.match(bark.speaker, /\s/);
  assert.ok(DIALOGUE_VARIANT_FLOOR > 60);
});

test('verified tape advances the quest and modifies surveying only while equipped', () => {
  const game = new GameState('chapter-test'),
    base = game.skills.surveying;
  game.startQuest('measure_opening');
  game.emit('talked', 'semyon');
  assert.equal(game.quests.get('measure_opening').objectives[1].id, 'tape');
  game.addItem('verified_tape');
  assert.equal(game.skills.surveying, base);
  assert.equal(game.skillValue('surveying'), base);
  assert.equal(game.equip('verified_tape'), true);
  assert.equal(game.skillValue('surveying'), base + 28);
  game.emit('measured', 'doorway');
  assert.equal(game.quests.get('measure_opening').state, 'complete');
  assert.equal(game.xp, 45);
  assert.equal(game.skillPoints, 1);
});

test('door procurement spends cash, rejects the wrong size and advances only a correct order', () => {
  const game = new GameState('door-order');
  game.startQuest('order_door');
  game.emit('supply_opened', 'door');
  const wrong = game.placeDoorOrder(800, 2000);
  assert.equal(wrong.correct, false);
  assert.equal(game.economy.cash, 161000);
  assert.equal(game.quests.get('order_door').current, 1);
  const correct = game.placeDoorOrder(910, 2110);
  assert.equal(correct.correct, true);
  assert.equal(game.economy.cash, 103000);
  assert.equal(game.economy.spent, 77000);
  assert.equal(game.quests.get('order_door').current, 2);
  game.installDoor();
  game.toggleDoor(true);
  assert.equal(game.quests.get('order_door').state, 'complete');
  assert.equal(game.project.door.open, true);
});

test('skill development spends one point and changes the base skill', () => {
  const game = new GameState('skills');
  game.skillPoints = 1;
  const before = game.skills.communication;
  assert.equal(game.upgradeSkill('communication'), true);
  assert.equal(game.skills.communication, before + 5);
  assert.equal(game.skillPoints, 0);
  assert.equal(game.upgradeSkill('communication'), false);
});

test('context manager prefers a visible urgent front then the nearest equal-priority action', () => {
  const actor = { position: new THREE.Vector3() },
    prompt = { classList: { toggle() {} }, innerHTML: '' },
    manager = new ContextActions({ actor, promptElement: prompt });
  let fired = '';
  const urgent = manager.register({
    id: 'urgent',
    object: { position: new THREE.Vector3(1.2, 0, 0) },
    label: 'urgent',
    priority: 10,
    action: () => {
      fired = 'urgent';
    },
  });
  manager.register({
    id: 'near',
    object: { position: new THREE.Vector3(0.6, 0, 0) },
    label: 'near',
    action: () => {
      fired = 'near';
    },
  });
  manager.register({
    id: 'hidden',
    object: { position: new THREE.Vector3(0.2, 0, 0), visible: false },
    label: 'hidden',
    priority: 20,
    action: () => {
      fired = 'hidden';
    },
  });
  manager.register({
    id: 'disabled',
    object: { position: new THREE.Vector3(0.1, 0, 0) },
    label: 'disabled',
    priority: 30,
    enabled: () => false,
    action: () => {
      fired = 'disabled';
    },
  });
  assert.equal(urgent.priority, 10);
  assert.equal(manager.update().id, 'urgent');
  assert.equal(manager.trigger(), true);
  assert.equal(fired, 'urgent');
  urgent.enabled = () => false;
  assert.equal(manager.update().id, 'near');
});

test('construction crate opens over time and its quest item can be removed', () => {
  const crate = createCrate();
  assert.equal(crate.target, 0);
  crate.open();
  for (let i = 0; i < 30; i++) crate.update(1 / 60);
  assert.ok(crate.progress > 0.9);
  assert.equal(crate.contents.visible, true);
  crate.takeContents();
  crate.update(1 / 60);
  assert.equal(crate.contents.visible, false);
});
