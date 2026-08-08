import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const game = await readFile(new URL('../game.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

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

test('mobile preparation keeps a horizontally readable Project-style graph and the site action sticky',()=>{
  assert.match(css,/\.prep-gates ol\{grid-template-columns:1fr\}/);
  assert.match(css,/\.prep-confirm,\.prep-materials\{grid-template-columns:1fr\}/);
  assert.match(css,/\.prep-exit-actions\{grid-template-columns:1fr\}/);
  assert.match(css,/\.market-roster #enterSite \{ position:sticky;/);
  assert.match(css,/\.prep-project-plan>#prepResourcePlan\{[^}]+overflow:auto/);
  assert.match(css,/\.prep-project-columns,\.prep-resource-row\{[^}]+min-width:820px/);
  assert.match(css,/\.prep-economics-kpis\{grid-template-columns:1fr 1fr\}/);
});

test('mobile site keeps the active physical work readable above the risky action',()=>{
  assert.match(html,/id="sceneActionCard"/);
  assert.match(css,/\.scene-action-card \{ left:10px; right:10px; bottom:72px;/);
  assert.match(css,/\.magic-site-button \{ right:10px; bottom:10px;/);
});

test('order dossier scrolls independently while the primary action stays visible',()=>{
  assert.match(css,/\.order-inspector \{ display:flex; flex-direction:column; min-height:0;[^}]+overflow:hidden;/);
  assert.match(css,/\.order-inspector #orderDetails\{flex:1 1 auto;min-height:0;[^}]+overflow-y:auto;/);
  assert.match(css,/\.order-inspector #acceptOrder\{position:relative;z-index:2;flex:0 0 auto;width:100%;min-height:52px;/);
  assert.match(css,/\.orders-modal \{ grid-template-columns:1fr;grid-template-rows:minmax\(230px,.72fr\) minmax\(0,1fr\);height:calc\(100dvh - 20px\)/);
});

test('tutorial does not cover main-menu or unrelated modal actions', () => {
  assert.match(game, /tutorialSuppressed=\[refs\.auth,refs\.menu,refs\.orders,refs\.result\]/);
  assert.match(game, /activeModal&&\(!target\|\|!activeModal\.contains\(target\)\)/);
  assert.match(game, /coach\.dataset\.placement=.*\?'top':'bottom'/);
});

test('mobile headquarters scrolls as one sheet and keeps game actions before long company cards',()=>{
  assert.match(css,/\.main-menu-modal \{ grid-template-columns: 1fr;[^}]+overflow-y:auto;[^}]+-webkit-overflow-scrolling:touch;/);
  assert.match(css,/\.main-menu-primary-actions \{ grid-template-columns:1fr; \}/);
  assert.match(css,/\.company-workspace \{ grid-template-columns:1fr; min-height:0; \}/);
  assert.match(css,/\.company-tabs \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\); \}/);
  assert.match(css,/\.company-console-content \{ max-height:none; min-height:240px; overflow:visible; \}/);
  assert.match(css,/\.upgrade-tree,\.hq-development \.upgrade-tree \{ grid-template-columns:1fr; \}/);
  assert.match(css,/\.market-subtabs \{ grid-template-columns:1fr; \}/);
  assert.match(css,/\.outsource-grid \{ grid-template-columns:1fr; \}/);
});

test('desktop headquarters separates upgrades from the boss cabinet and scrolls only the workspace',()=>{
  assert.match(html,/id="officeSubtabs"[^>]+hidden/);
  assert.match(html,/data-office-section="development"/);
  assert.match(html,/data-office-section="boss"/);
  assert.match(game,/let companyTab='portfolio';let officeSection='development'/);
  assert.match(game,/hqCard\.hidden=companyTab!=='office'\|\|officeSection!=='boss'/);
  assert.match(css,/\.company-tabs \{ grid-template-columns:repeat\(6,minmax\(0,1fr\)\); \}/);
  assert.match(css,/\.company-console-content \{[\s\S]*?max-height:none;[\s\S]*?overflow:auto;/);
  assert.match(css,/\.hq-development \.upgrade-tree \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/);
});
