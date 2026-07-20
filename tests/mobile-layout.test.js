import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const game = await readFile(new URL('../game.js', import.meta.url), 'utf8');

test('mobile schedule keeps its action visible outside the scrolling task list', () => {
  assert.match(css, /\.schedule-modal \{ display:flex; flex-direction:column; height:calc\(100dvh - 20px\)/);
  assert.match(css, /\.schedule-calendar \{ flex:1 1 auto; min-height:0; max-height:none; overflow-x:hidden; overflow-y:auto/);
  assert.match(css, /\.schedule-actions \.primary-button \{ width:100%; min-height:50px; \}/);
});

test('mobile planning scrolls tasks without moving the start-day action', () => {
  assert.match(css, /\.planning-modal \{ display:flex; flex-direction:column;[^}]+overflow:hidden;/);
  assert.match(css, /\.day-plan-list \{ flex:1 1 auto;[^}]+overflow-y:auto;/);
  assert.match(css, /\.planning-modal #startDay \{ flex:0 0 auto; min-height:50px; \}/);
});

test('tutorial does not cover main-menu or unrelated modal actions', () => {
  assert.match(game, /tutorialSuppressed=\[refs\.auth,refs\.menu,refs\.orders,refs\.result\]/);
  assert.match(game, /activeModal&&\(!target\|\|!activeModal\.contains\(target\)\)/);
  assert.match(game, /coach\.dataset\.placement=.*\?'top':'bottom'/);
});

test('mobile headquarters scrolls as one sheet and keeps game actions before long company cards',()=>{
  assert.match(css,/\.main-menu-modal \{ grid-template-columns: 1fr;[^}]+overflow-y:auto;[^}]+-webkit-overflow-scrolling:touch;/);
  assert.match(css,/\.main-menu-actions \.menu-button \{ order:1; \}/);
  assert.match(css,/\.main-menu-actions \.organization-card, \.main-menu-actions \.company-console, \.main-menu-actions \.hq-menu-card, \.main-menu-actions \.source-links \{ order:2; \}/);
  assert.match(css,/\.company-tabs \{ display:flex; overflow-x:auto;/);
  assert.match(css,/\.company-console-content \{ max-height:none; min-height:240px; overflow:visible; \}/);
});
