import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../game.js',import.meta.url),'utf8');

test('every static button is wired directly or through its form',()=>{
  const ids=[...html.matchAll(/<button[^>]*\sid="([^"]+)"/g)].map(match=>match[1]);
  const formSubmitIds=new Set(['loginButton']);
  const missing=ids.filter(id=>!formSubmitIds.has(id)&&!script.includes(`$('#${id}').addEventListener`));
  assert.deepEqual(missing,[]);
  assert.match(script,/\$\('#authForm'\)\.addEventListener\('submit'/);
});

test('every delegated button family has a matching click route',()=>{
  const delegated=[
    'loan','order-id','contract-card','team-hire','map-hire','day-task',
    'schedule-day','schedule-order','send-urgent','email-template','send-email',
    'task','priority','hire','event-choice','situation-choice','close-modal','close-sidebook',
  ];
  for(const name of delegated)assert.ok(script.includes(`closest('[data-${name}]')`),`missing handler for data-${name}`);
});
