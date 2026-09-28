/* =====================================================================
   THE PAGE ITSELF.

   index.html is the whole product: a canvas, a block editor and three
   objects, with no server, no database and no sign-in behind it. The
   bugs a page like this gets are the ones Pong's standalone page got —
   something the big engine happened to provide, silently missing here,
   and failing somewhere else entirely. So these check the seam: every
   file the page names is here, nothing is fetched from the network, every
   element the modules reach for is on the page, and the globals the old
   engine supplied are supplied.
   ===================================================================== */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const has  = f => fs.existsSync(path.join(__dirname,'..',f));
const PAGE = read('index.html');
const BOOT = read('boot.js');

test('every file the page names is a file that is here', ()=>{
  const refs=[...PAGE.matchAll(/(?:src|href)="([^"?]+)/g)].map(m=>m[1]);
  assert.ok(refs.length >= 8, 'the page has stopped loading its own code');
  refs.forEach(f=>assert.ok(has(f), `index.html asks for ${f}, which is not in this folder`));
});

test('nothing is fetched from the network — a lab with no internet still plays', ()=>{
  const faces=[...PAGE.matchAll(/url\('([^']+\.woff2)'\)/g)].map(m=>m[1]);
  assert.ok(faces.length >= 4, 'the @font-face block has gone');
  faces.forEach(f=>assert.ok(has(f), `index.html declares ${f}, which is not in this folder`));
  assert.ok(!/https?:\/\//.test(PAGE.replace(/<!--[\s\S]*?-->/g,'')), 'the page links to the network');
  ['dino.js','costumes.js','boot.js'].forEach(f=>
    assert.ok(!/fetch\(|XMLHttpRequest|https?:\/\//.test(read(f)), `${f} reaches for the network`));
});

test('the scripts load in the order they depend on each other', ()=>{
  const srcs=[...PAGE.matchAll(/<script src="([^"?]+)/g)].map(m=>m[1]);
  const at=f=>srcs.indexOf(f);
  ['lib/three.classic.js','strings.js','blocks.js','vm.js','coder.js','costumes.js','dino.js','boot.js']
    .forEach(f=>assert.ok(at(f)>=0, `${f} is not loaded`));
  assert.ok(at('strings.js')<at('dino.js'), 'dino.js adds to the Spanish words before they exist');
  assert.ok(at('costumes.js')<at('dino.js') && at('vm.js')<at('costumes.js'), 'costumes load out of order');
  assert.strictEqual(srcs[srcs.length-1], 'boot.js', 'boot.js has to run last — it starts everything');
});

test('every ?v= cache tag is the same number', ()=>{
  const tags=new Set([...PAGE.matchAll(/\?v=(\d+)/g)].map(m=>m[1]));
  assert.strictEqual(tags.size, 1, `the tags have drifted apart: ${[...tags].join(', ')} — run npm run bump`);
});

test('every element the room and the editor need is on the page', ()=>{
  const ids=new Set([...PAGE.matchAll(/id="([A-Za-z][\w-]*)"/g)].map(m=>m[1]));
  ['view','dino','dnTop','dnOpen','dnRun','dnHelp','dnSound','dnLang','dnReset','dnScore','dnMsg','dnTeacher','dnBrief',
   'coder','cBar','cObj','cPal','cScript']
    .forEach(id=>assert.ok(ids.has(id), `#${id} is missing — whatever reaches for it will throw`));
  const dino=read('dino.js');
  [...dino.matchAll(/\$\('#([A-Za-z][\w-]*)'\)/g)].map(m=>m[1])
    .filter(id=>!['dnGo','dnLang2','dnAgain'].includes(id))        // drawn by dino.js itself
    .forEach(id=>assert.ok(ids.has(id), `dino.js reaches for #${id}, which the page does not have`));
});

test('the globals the old engine provided are provided here', ()=>{
  assert.match(BOOT, /window\.uiFont\s*=/, 'nothing defines uiFont, so every `say` throws');
  assert.match(BOOT, /window\.G\s*=/, 'nothing defines G');
  ['scene','camera','roomGroup','solids','hits','keys','pos','running','room']
    .forEach(k=>assert.ok(new RegExp('\\b'+k+'\\s*:').test(BOOT), `G has no ${k}`));
  assert.match(BOOT, /DINO\.start\(\)/, 'nothing starts the game');
});

test('on the shelf, `if then else` shows its else, so it does not look like `if then`', ()=>{
  const coder=read('coder.js');
  assert.match(coder, /bd\.kind==='c2'[^\n]*cpelse/, 'the shelf draws if-else exactly like if');
  assert.match(PAGE, /\.cpelse\{/, 'the else on the shelf has no style, so it runs into the if');
});

test('the game runs on its own clock, not the screen\'s', ()=>{
  /* a 120 Hz screen must not make the cactuses twice as fast */
  assert.match(BOOT, /STEP\s*=\s*1\/60/, 'there is no fixed step');
  assert.match(BOOT, /DINO\.step\(STEP\)/, 'the game is not stepped on it');
});

test('every word on the page has a Spanish translation', ()=>{
  const src=read('dino.js');
  const es=src.slice(src.indexOf('Object.assign(window.ES'), src.indexOf('});', src.indexOf('Object.assign(window.ES')));
  const asked=[...src.matchAll(/\bT\('((?:[^'\\]|\\.)+)'/g)].map(m=>m[1]);
  const tries=src.slice(src.indexOf('const steps=['), src.indexOf('];', src.indexOf('const steps=[')));
  const listed=[...tries.matchAll(/'((?:[^'\\]|\\.)+)'/g)].map(m=>m[1]);
  const words=[...asked, ...listed];
  assert.ok(words.length > 20, 'the English strings could not be found');
  words.forEach(w=>assert.ok(es.includes(`'${w}':`), `no Spanish for: ${w}`));
});
