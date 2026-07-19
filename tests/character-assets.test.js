import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const characterFiles=['Worker_Male.glb','Worker_Female.glb','Suit_Male.glb','Suit_Female.glb'];

test('all rigged character assets are valid GLB 2 containers',async()=>{
  for(const file of characterFiles){
    const path=new URL(`../public/assets/characters/${file}`,import.meta.url);
    const info=await stat(path);
    assert.ok(info.size>100_000,`${file} should contain a real rigged model`);
    const header=await readFile(path,{encoding:null});
    assert.equal(header.subarray(0,4).toString('ascii'),'glTF');
    assert.equal(header.readUInt32LE(4),2);
  }
});

test('character asset provenance is shipped with the game',async()=>{
  const license=await readFile(new URL('../public/assets/characters/LICENSE.md',import.meta.url),'utf8');
  assert.match(license,/Quaternius/);
  assert.match(license,/CC0-1\.0/);
});

test('encounter chatter contains at least sixty two-line exchanges',async()=>{
  const source=await readFile(new URL('../game.js',import.meta.url),'utf8');
  const block=source.split('const ENCOUNTER_DIALOGUES=')[1]?.split('let activeEncounterDialogue')[0]??'';
  const exchanges=block.match(/\['[^']+','[^']+'\]/g)??[];
  assert.ok(exchanges.length>=60,`expected at least 60 exchanges, found ${exchanges.length}`);
});
