/* =====================================================================
   DINO RUN — the build-it-yourself version.

   Every refresh hands a student three objects: the Dino and a Cactus
   with no code, and the Ground already sliding along under them so the
   Dino looks like it runs. These tests hold the page to that, and hold the
   teacher's answer key (?answer) to being a real, short, winnable game —
   played headless, with the real VM running the real blocks.
   ===================================================================== */
const test = require('node:test');
const assert = require('node:assert');
const { desert, player, read } = require('./harness.js');

const bare = s => s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
const DINOJS = bare(read('dino.js'));

const d0 = desert(1);
const { BLOCKS:B, DINO, COSTUMES } = d0;
const A = DINO.answer();
const NAMES = DINO.CAST.map(c=>c.name);

/* ------------------------------------------------------------ helpers */
function all(list, out){
  out = out || [];
  (list||[]).forEach(b=>{
    if(!b || typeof b!=='object') return;
    out.push(b);
    Object.keys(b.args||{}).forEach(k=>{
      const v=b.args[k];
      if(v && typeof v==='object' && v.op) all([v], out);
    });
    all(b.body, out); all(b.body2, out);
  });
  return out;
}
const blocks = name => A[name].flatMap(sc=>all([sc.hat]).concat(all(sc.body)));
const has = (bk,op) => all([bk]).some(b=>b.op===op);
const hat = (name,op) => A[name].find(sc=>sc.hat.op===op);
const loopOf = sc => sc.body.find(b=>b.op==='ctrl.forever');

/* ================================================= what a student gets */
test('three objects: the Dino, one Cactus and the Ground', ()=>{
  assert.deepStrictEqual(Array.from(NAMES), ['Dino','Cactus','Ground']);
  DINO.CAST.forEach(c=>{
    assert.ok(COSTUMES.isModel(c.shape), `${c.name} wears ${c.shape}, which is not a costume`);
    assert.notStrictEqual(c.visible, false, `${c.name} is hidden, so nobody can see what to program`);
  });
});

test('every refresh hands over the Ground\'s code and nothing else', ()=>{
  const s=DINO.starter();
  ['Dino','Cactus'].forEach(n=>assert.strictEqual(s[n].length, 0, `${n} arrives with code`));
  assert.strictEqual(s.Ground.length, 1, 'the Ground arrives without its script');
  const d=desert(2, 'starter');
  ['Dino','Cactus'].forEach(n=>assert.strictEqual(d.VM.actorByName(n).scripts.length, 0));
  assert.strictEqual(d.VM.actorByName('Ground').scripts.length, 1);
});

test('with only the starter, the Ground runs and nothing else moves', ()=>{
  const d=desert(2, 'starter');
  const at=n=>{ const a=d.VM.actorByName(n); return [a.x, a.z]; };
  const dino=at('Dino'), cactus=at('Cactus');
  let lo=Infinity, hi=-Infinity;
  d.VM.greenFlag();
  for(let i=0;i<240;i++){
    d.G.keys.Space = i<5; d.step();
    const x=d.VM.actorByName('Ground').x; lo=Math.min(lo,x); hi=Math.max(hi,x);
  }
  assert.ok(hi-lo > 20, 'the Ground does not slide, so the Dino does not look like it runs');
  assert.ok(lo >= -DINO.NUM.TILE-1 && hi <= 0.01, `the Ground wandered off (${lo} to ${hi}): it never jumps back`);
  assert.deepStrictEqual(at('Dino'), dino, 'the Dino moved with no code');
  assert.deepStrictEqual(at('Cactus'), cactus, 'the Cactus moved with no code');
  assert.strictEqual(Number(d.VM.project.vars.score)||0, 0, 'the starter counts the score, which is the student\'s job');
});

test('the starter\'s Ground is the answer\'s Ground, less the score', ()=>{
  const g=DINO.starter().Ground[0];
  const ops=all([g.hat]).concat(all(g.body)).map(b=>b.op);
  const want=blocks('Ground').filter(b=>!(b.op==='data.change' && b.args.v==='score')).map(b=>b.op);
  assert.deepStrictEqual(Array.from(ops), Array.from(want));
});

test('the scoreboard\'s variable is made ready, and it is the only one', ()=>{
  const d=desert(3, 'starter');
  assert.deepStrictEqual(Object.keys(d.VM.project.vars), ['score']);
});

test('a refresh never brings code back: the room never saves the blocks', ()=>{
  const writes=[...DINOJS.matchAll(/localStorage\.setItem\(\s*([A-Z_]+)/g)].map(m=>m[1]);
  assert.ok(writes.length, 'the setItem calls could not be found');
  writes.forEach(k=>assert.ok(['HI_KEY','LANG_KEY','SOUND_KEY'].includes(k), `the room saves ${k}`));
  assert.ok(!/getItem\([^)]*scripts/.test(DINOJS), 'the room reads saved blocks back');
  assert.match(DINOJS, /teacher \? answer\(\) : starter\(\)/, 'a page load does not start from the empty code');
});

test('the room does not play the game: no rule is written in JavaScript', ()=>{
  const room=DINOJS.replace(/function answer\(\)\{[\s\S]*?\n  \}\n/, '');
  assert.ok(!/vars\.score\s*[+\-]?=/.test(room.replace(/VM\.project\.vars\.score=0;/,'')), 'the room writes the score');
  assert.ok(!/\.z\s*[+\-]=/.test(room), 'the room moves something up or down itself');
});

/* ================================================ the teacher's answer */
test('the answer key uses only blocks on the shelf, with every slot filled', ()=>{
  const pal=DINO.PALETTE.ops;
  NAMES.forEach(n=>blocks(n).forEach(b=>{
    const bd=B.of(b.op);
    assert.ok(bd, `${n} contains ${b.op}, which is not a block`);
    assert.ok(pal.includes(b.op), `${n} uses ${b.op}, which a student cannot find on the shelf`);
    Object.keys(bd.args||{}).forEach(k=>{
      if(bd.args[k].type==='bool') return;
      const v=(b.args||{})[k];
      assert.ok(v!==undefined && v!=='' && v!==null, `${n}: ${b.op} has nothing in its "${k}" slot`);
    });
  }));
});

test('the answer key is short enough to build in a lesson', ()=>{
  const size = n => blocks(n).length;
  assert.ok(size('Dino')   <= 8,  `the Dino's answer has ${size('Dino')} blocks`);
  assert.ok(size('Cactus') <= 11, `the Cactus's answer has ${size('Cactus')} blocks`);
  assert.ok(size('Ground') <= 9,  `the Ground's answer has ${size('Ground')} blocks`);
});

test('answer — Dino: SPACE jumps with two glides, only from the ground', ()=>{
  const jump=hat('Dino','event.key');
  assert.ok(jump && jump.hat.args.k==='space', 'SPACE does nothing');
  const ground=jump.body.find(b=>b.op==='ctrl.if' && b.args.c.op==='op.eq' && has(b.args.c,'motion.pos'));
  assert.ok(ground, 'nothing asks whether the Dino is on the ground, so it can jump in mid-air');
  const glides=ground.body.filter(b=>b.op==='motion.glide');
  assert.strictEqual(glides.length, 2, 'a jump is one glide up and one glide down');
  assert.ok(glides[0].args.y>0, 'the first glide does not go up');
  assert.strictEqual(glides[1].args.y, 0, 'the second glide does not land on the ground');
});

test('answer — Cactus: slides left, comes back, and ends the game on the Dino', ()=>{
  const loop=loopOf(hat('Cactus','event.flag'));
  assert.ok(loop.body.some(b=>b.op==='motion.changeBy' && b.args.a==='x' && b.args.n<0), 'the cactus never moves left');
  assert.ok(loop.body.some(b=>b.op==='ctrl.if' && b.args.c.op==='op.lt' && b.body.some(x=>x.op==='motion.setTo' && x.args.a==='x')),
    'the cactus never comes back');
  const hit=loop.body.find(b=>b.op==='ctrl.if' && b.args.c.op==='sense.touch');
  assert.ok(hit && hit.args.c.args.o==='Dino' && hit.body.some(b=>b.op==='ctrl.stop' && b.args.w==='all'),
    'touching the Dino does not end the game');
});

test('answer — Ground: slides left, never runs out, and counts the score', ()=>{
  const loop=loopOf(hat('Ground','event.flag'));
  assert.ok(loop.body.some(b=>b.op==='motion.changeBy' && b.args.a==='x' && b.args.n<0), 'the ground never moves');
  assert.ok(loop.body.some(b=>b.op==='ctrl.if' && b.body.some(x=>x.op==='motion.changeBy' && x.args.n===DINO.NUM.TILE)),
    'the ground runs out');
  assert.ok(loop.body.some(b=>b.op==='data.change' && b.args.v==='score'), 'nothing counts the score');
});

/* =================================================== the costumes */
test('the ground tiles every 32 squares, so the jump back is invisible', ()=>{
  const rows=COSTUMES.C['desert/ground'].art;
  const period=Math.round(DINO.NUM.TILE/COSTUMES.PX);
  rows.forEach((r,j)=>{
    for(let i=0;i+period<r.length;i++)
      assert.strictEqual(r[i], r[i+period], `row ${j} has a seam at ${i}`);
  });
});

test('every character is one still picture — nothing animates by itself', ()=>{
  Object.entries(COSTUMES.C).forEach(([cid,c])=>{
    assert.ok(Array.isArray(c.art) && c.art.every(r=>typeof r==='string'), `${cid} is not one picture`);
    assert.ok(!('frames' in c) && !('anim' in c), `${cid} has frames that change on their own`);
  });
  assert.strictEqual(COSTUMES.animate, undefined, 'the costumes still have an animation step');
});

/* a stand-in object wearing a costume, for asking `touching` */
const wearing = (cid, x, y) => ({ shape:cid, x, z:-y, size:1 });
test('two drawings touch where their pixels do — not where their boxes do', ()=>{
  const dino=wearing('dino/dino', -12, 0);
  assert.strictEqual(COSTUMES.touching(dino, wearing('desert/cactus', -11, 0)), true, 'a cactus in its body');
  assert.strictEqual(COSTUMES.touching(dino, wearing('desert/cactus', -11, 3)), false, 'a cactus well above it');
  assert.strictEqual(COSTUMES.touching(wearing('dino/dino', -12, 2.2), wearing('desert/cactus', -12, 0)), false,
    'feet clear of the top of a small cactus still counted as a hit');
  /* above the tail and behind the head the picture is empty: a cactus
     hanging there is inside the Dino's box and outside the Dino */
  const corner=wearing('desert/cactus', -12.8, 1.65);
  const a=COSTUMES.rect(dino), b=COSTUMES.rect(corner);
  assert.ok(a.x0<b.x1 && b.x0<a.x1 && a.y0<b.y1 && b.y0<a.y1, 'the test cactus is not even inside the box');
  assert.strictEqual(COSTUMES.touching(dino, corner), false, 'the empty corner of the picture counted as the Dino');
  assert.strictEqual(COSTUMES.touching(dino, wearing('desert/cactus', -13.0, 1.0)), true,
    'lowered onto the tail, it should touch');
  assert.strictEqual(COSTUMES.touching(dino, { x:0, z:0, size:1, shape:'cube' }), null,
    'a plain shape should fall back to the VM\'s sphere');
});

/* ====================================================== playing it */
const LEAD = 16;             // how many frames before the cactus the test player jumps
function play(seed, lead, seconds){
  const d=desert(seed);
  d.VM.greenFlag();
  while(d.VM.running && d.seconds<seconds){
    if(lead!=null) player(d, lead);
    d.step();
  }
  return d;
}
test('with the answer key, a player who jumps on time survives a minute', ()=>{
  [1,2,3].forEach(seed=>{
    const d=play(seed, LEAD, 60);
    assert.ok(d.VM.running, `seed ${seed}: crashed at ${d.seconds.toFixed(1)}s`);
    assert.ok(+d.VM.project.vars.score > 600, 'the score did not count up');
  });
});
test('the timing matters: jumping far too early or far too late loses', ()=>{
  const late=play(4, 0, 30), early=play(4, 40, 30);
  assert.ok(!late.VM.running, 'jumping on contact still survived');
  assert.ok(!early.VM.running, 'jumping from miles away still survived');
});
test('a player who does nothing crashes into the cactus', ()=>{
  const d=play(5, null, 30);
  assert.ok(!d.VM.running, 'nothing ended the game');
  assert.ok(d.seconds < 6, `it took ${d.seconds.toFixed(1)}s to crash`);
  assert.ok(d.obstacles().some(o=>d.COSTUMES.touching(d.dino(), o)), 'the game stopped with nothing touching the Dino');
});
test('a changed number changes the game: a bigger `y` in the glide jumps higher', ()=>{
  const peak=(y)=>{
    const d=desert(6);
    const up=all(d.dino().scripts[1].body).find(b=>b.op==='motion.glide' && b.args.y>0);
    up.args.y=y;
    d.VM.greenFlag(); d.G.keys.Space=true;
    let top=0, landed=false;
    for(let i=0;i<120;i++){ d.step(); if(i===2) d.G.keys.Space=false;
      const h=-d.dino().z; top=Math.max(top, h); if(i>10 && h===0) landed=true; }
    return { top, landed };
  };
  const normal=peak(DINO.NUM.JUMP_Y), moon=peak(9);
  assert.ok(Math.abs(normal.top-DINO.NUM.JUMP_Y)<0.01, `a normal jump peaks at ${normal.top.toFixed(2)}`);
  assert.ok(normal.landed, 'the Dino never came back down');
  assert.ok(moon.top>8.9, 'a bigger number did not jump higher');
});
