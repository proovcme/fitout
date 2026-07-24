import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css=await readFile(new URL('../styles.css',import.meta.url),'utf8');
const color=(name)=>css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
const luminance=(hex)=>hex.match(/\w\w/g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
const contrast=(foreground,background)=>{const a=luminance(foreground);const b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};

test('shared secondary text colors meet WCAG AA on the lightest dark game surface',()=>{
  const surface='#24312b';
  assert.ok(contrast(color('muted'),surface)>=4.5);
  assert.ok(contrast(color('faint'),surface)>=4.5);
});

test('order dossier keeps meaningful text at a readable UI size',()=>{
  assert.match(css,/\.orders-map-panel>p \{[^}]+font-size:13px/);
  assert.match(css,/\.order-inspector \.order-location\{[^}]+font-size:12px/);
  assert.match(css,/\.order-metrics small\{[^}]+font-size:10px/);
  assert.match(css,/\.order-client small\{[^}]+font-size:11px/);
  assert.match(css,/\.order-risks li\{[^}]+font-size:11px/);
});
