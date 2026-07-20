import assert from 'node:assert/strict';
import { ensureGameSaveV2, validateGameSaveV2 } from '../company-core.js';
import { createInitialState, restoreState, serializeState } from '../game-core.js';

const legacy=createInitialState();
legacy.selectedOrder={id:'migration-smoke',title:'Объект из старого сохранения',location:'Москва'};
legacy.phase='execution';
delete legacy.schemaVersion;
delete legacy.company;
delete legacy.portfolio;
delete legacy.staff;
delete legacy.contractorNetwork;
delete legacy.companyCalendar;

ensureGameSaveV2(legacy);
const validation=validateGameSaveV2(legacy);
assert.equal(validation.ok,true,validation.errors?.join(', '));
assert.equal(legacy.portfolio.projects.length,1);
assert.equal(legacy.portfolio.projects[0].snapshot.selectedOrder.title,'Объект из старого сохранения');

const encoded=serializeState(legacy);
assert.ok(Buffer.byteLength(encoded)<5_000_000,'save exceeds API limit');
const restored=restoreState(encoded);
assert.equal(restored.schemaVersion,2);
assert.equal(restored.selectedOrder.title,'Объект из старого сохранения');
process.stdout.write(`migration smoke ok · ${Buffer.byteLength(encoded)} bytes\n`);
