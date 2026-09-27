#!/usr/bin/env node
/* =====================================================================
   Every script and stylesheet in index.html carries `?v=N`, and this is
   what moves it. A browser that has yesterday's coder.js cached and
   today's pong.js is a browser running two halves of two different
   programs, and the bug it produces looks like nothing else.

   Not edited by hand, because doing it by hand means doing it to nine
   tags and missing one.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const PAGE = path.join(__dirname, '..', 'index.html');

function main(){
  const src = fs.readFileSync(PAGE, 'utf8');
  const tags = [...src.matchAll(/\?v=(\d+)/g)].map(m => +m[1]);
  if(!tags.length) throw new Error('index.html has no ?v= tags');
  const seen = [...new Set(tags)];
  const next = Math.max(...seen) + 1;
  if(seen.length > 1)
    console.log(`(they had drifted apart: ${seen.sort((a,b)=>a-b).join(', ')})`);
  fs.writeFileSync(PAGE, src.replace(/\?v=\d+/g, '?v=' + next));
  console.log(`v=${next} — ${tags.length} tags`);
}
main();
