/* =====================================================================
   DINO RUN — a finished game, and nothing hidden behind it.

   The one claim the room makes is the one Pong makes: EVERY RULE OF THE
   GAME IS A BLOCK. The jump, ducking, the crash, what comes next, how
   fast it comes and the score are all on a shelf a
   student can open. If one of them moves out of the blocks and back into
   JavaScript, something here goes red.

   And then it is PLAYED, headless, with the real VM running the real
   scripts: a player who jumps on time has to be able to survive two
   minutes at full speed, and one who does nothing has to lose — or it is
   not a game, it is a screensaver.
   ===================================================================== */
const test = require('node:test');
const assert = require('node:assert');
const { desert, player, read } = require('./harness.js');

const bare = s => s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
const DINOJS = bare(read('dino.js'));

const d0 = desert(1);
const { BLOCKS:B, DINO, COSTUMES } = d0;
const S = DINO.scripts();
const NAMES = DINO.CAST.map(c=>c.name);
const OBST = DINO.OBSTACLES;

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
const blocks = name => S[name].flatMap(sc=>all([sc.hat]).concat(all(sc.body)));
const has = (bk,op) => all([bk]).some(b=>b.op===op);
const hat = (name,op) => S[name].find(sc=>sc.hat.op===op);
const loopOf = sc => sc.body.find(b=>b.op==='ctrl.forever');

/* ================================================== it is a whole game */
test('every object arrives with a script that starts on Run', ()=>{
  NAMES.forEach(n=>{
    assert.ok(S[n] && S[n].length, n+' has no script');
    assert.ok(hat(n,'event.flag'), n+' never starts');
  });
});

test('every block in the game is a real block, on the palette, with its slots filled', ()=>{
  const pal=DINO.PALETTE.ops;
  NAMES.forEach(n=>blocks(n).forEach(b=>{
    const bd=B.of(b.op);
    assert.ok(bd, `${n} contains ${b.op}, which is not a block`);
    assert.ok(pal.includes(b.op), `${n} uses ${b.op} and it is not on the shelf — nobody can change that rule`);
    Object.keys(bd.args||{}).forEach(k=>{
      if(bd.args[k].type==='bool') return;
      const v=(b.args||{})[k];
      assert.ok(v!==undefined && v!=='' && v!==null, `${n}: ${b.op} has nothing in its "${k}" slot`);
    });
  }));
});

test('every costume the game asks for is one the costume shelf has', ()=>{
  NAMES.forEach(n=>blocks(n).filter(b=>b.op==='looks.shape').forEach(b=>
    assert.ok(COSTUMES.isModel(b.args.s) && COSTUMES.find(b.args.s),
      `${n} becomes ${b.args.s}, which is not a costume`)));
});

/* ============================================ the rules, one at a time */
test('the code is short: a handful of blocks per object, three shared variables', ()=>{
  /* every block counts, hats and the little rounded ones inside slots
     too; these are the sizes the game was simplified down to */
  const size = n => blocks(n).length;
  assert.ok(size(DINO.DINO) <= 13, `the Dino has grown to ${size(DINO.DINO)} blocks`);
  OBST.forEach(o=>assert.ok(size(o.name) <= 20, `${o.name} has grown to ${size(o.name)} blocks`));
  assert.ok(size(DINO.GROUND) <= 19, `the Ground has grown to ${size(DINO.GROUND)} blocks`);
  const vars=new Set(NAMES.flatMap(n=>blocks(n).filter(b=>/^data\./.test(b.op)).map(b=>b.args.v)));
  assert.deepStrictEqual([...vars].sort(), ['next','score','speed']);
});

test('the Dino jumps on SPACE: glide up, glide back down — only from the ground', ()=>{
  const jump=hat(DINO.DINO,'event.key');
  assert.ok(jump && jump.hat.args.k==='space', 'SPACE does nothing');
  const ground=jump.body.find(b=>b.op==='ctrl.if' && b.args.c.op==='op.eq' && has(b.args.c,'motion.pos'));
  assert.ok(ground, 'nothing asks whether the Dino is on the ground, so it can jump in mid-air');
  const glides=ground.body.filter(b=>b.op==='motion.glide');
  assert.strictEqual(glides.length, 2, 'a jump is one glide up and one glide down');
  assert.ok(glides[0].args.y>0, 'the first glide does not go up');
  assert.strictEqual(glides[1].args.y, 0, 'the second glide does not land on the ground');
  assert.strictEqual(glides[0].args.x, glides[1].args.x, 'the Dino drifts sideways while it jumps');
});

test('↓ ducks', ()=>{
  const loop=loopOf(hat(DINO.DINO,'event.flag'));
  const duck=loop.body.find(b=>b.op==='ctrl.ifelse' && has(b.args.c,'sense.key'));
  assert.ok(duck && duck.args.c.args.k==='down', 'no ducking on ↓');
  assert.strictEqual(duck.body[0].args.s, 'dino/ducking');
  assert.strictEqual(duck.body2[0].args.s, 'dino/dino', 'letting go of ↓ does not stand it back up');
});

test('each obstacle is an object of its own, wearing its own picture', ()=>{
  assert.deepStrictEqual(Array.from(OBST, o=>o.name), ['Small Cactus','Big Cactus','Cactus Group','Bird']);
  OBST.forEach(o=>{
    const c=DINO.CAST.find(x=>x.name===o.name);
    assert.ok(c, `${o.name} is not in the cast`);
    assert.strictEqual(c.shape, o.shape);
    assert.ok(COSTUMES.isModel(o.shape), `${o.name} wears ${o.shape}, which is not a costume`);
    assert.strictEqual(c.visible, false, `${o.name}'s original would be sitting on the screen`);
    assert.strictEqual(c.x, DINO.NUM.SPAWN_X, `${o.name} waits somewhere its copies should not start`);
    assert.ok(!blocks(o.name).some(b=>b.op==='looks.shape'), `${o.name} changes into something else`);
  });
  assert.strictEqual(new Set(OBST.map(o=>o.shape)).size, OBST.length, 'two obstacles wear the same picture');
  assert.strictEqual(DINO.CAST.find(x=>x.name==='Bird').y, DINO.NUM.LANE, 'the Bird is not at head height');
});

test('each obstacle waits for its number, makes one copy, and the copy slides, hits, and goes', ()=>{
  assert.deepStrictEqual(OBST.map(o=>o.n).sort(), OBST.map((o,i)=>i+1), 'the numbers are not 1, 2, 3, 4');
  OBST.forEach(o=>{
    const flag=hat(o.name,'event.flag');
    assert.ok(flag.body.some(b=>b.op==='looks.hide'), `${o.name}: the original is not hidden`);
    const loop=loopOf(flag);
    const wait=loop.body.find(b=>b.op==='ctrl.waitUntil');
    assert.ok(wait && wait.args.c.op==='op.eq' && wait.args.c.args.a.args.v==='next' && wait.args.c.args.b===o.n,
      `${o.name} does not wait for next = ${o.n}`);
    assert.ok(loop.body.some(b=>b.op==='data.set' && b.args.v==='next' && b.args.n===0),
      `${o.name} never gives the turn back, so it would make a copy every frame`);
    assert.ok(loop.body.some(b=>b.op==='ctrl.clone'), `${o.name} never makes a copy`);
    const clone=hat(o.name,'event.clone');
    assert.ok(clone.body.some(b=>b.op==='looks.show'), `${o.name}: a copy of a hidden object stays hidden`);
    const run=clone.body.find(b=>b.op==='ctrl.repeatUntil');
    assert.ok(run && run.body.some(b=>b.op==='motion.changeBy' && b.args.a==='x'), `${o.name}: a copy never moves`);
    const hit=run.body.find(b=>b.op==='ctrl.if' && b.args.c.op==='sense.touch');
    assert.ok(hit && hit.args.c.args.o===DINO.DINO, `${o.name} never checks for the Dino`);
    assert.ok(hit.body.some(b=>b.op==='ctrl.stop' && b.args.w==='all'), `touching the ${o.name} does not end the game`);
    assert.strictEqual(clone.body[clone.body.length-1].op, 'ctrl.delclone', `${o.name}: copies pile up for ever`);
  });
});

test('the Ground scrolls, speeds up, counts the score, and picks what comes next', ()=>{
  const loop=loopOf(hat(DINO.GROUND,'event.flag'));
  assert.ok(loop.body.some(b=>b.op==='motion.changeBy' && b.args.a==='x'), 'the ground never moves');
  assert.ok(loop.body.some(b=>b.op==='ctrl.if' && b.body.some(x=>x.op==='motion.changeBy' && x.args.n===DINO.NUM.TILE)),
    'the ground runs out');
  assert.ok(loop.body.some(b=>b.op==='data.change' && b.args.v==='score'), 'nothing counts the score');
  assert.ok(loop.body.some(b=>b.op==='data.change' && b.args.v==='speed' && b.args.n>0), 'the game never gets faster');
  const decide=S[DINO.GROUND].find(sc=>all(sc.body).some(b=>b.op==='data.set' && b.args.v==='next' && has(b,'op.random')));
  assert.ok(decide, 'nothing ever sets `next`, so nothing ever comes out');
  const pick=all(decide.body).find(b=>b.op==='data.set' && b.args.v==='next');
  assert.strictEqual(pick.args.n.args.a, 1);
  assert.strictEqual(pick.args.n.args.b, OBST.length, 'some obstacle can never be picked');
  const gap=loopOf(decide).body.find(b=>b.op==='ctrl.wait');
  assert.ok(gap && has(gap,'op.random'), 'every gap is the same gap');
  assert.ok(!Number.isInteger(gap.args.n.args.a) || !Number.isInteger(gap.args.n.args.b),
    'a random between two whole numbers is a whole number: the gap would be exactly 1 or 2 seconds');
});

test('the room does not play the game: no rule is written in JavaScript', ()=>{
  const room=DINOJS.replace(/function scripts\(\)\{[\s\S]*?\n  \}\n/, '');
  assert.ok(!/stopAll\(\)[^;]*;[^\n]*crash/i.test(room), 'the room ends the game itself');
  assert.ok(!/vars\.score\s*[+\-]?=/.test(room.replace(/VM\.project\.vars\.score=0;/,'')),
    'the room writes the score');
  assert.ok(!/\.z\s*[+\-]=/.test(room), 'the room moves something up or down itself');
});

test('a refresh brings back the original game: the room never saves the blocks', ()=>{
  const writes=[...DINOJS.matchAll(/localStorage\.setItem\(\s*([A-Z_]+)/g)].map(m=>m[1]);
  assert.ok(writes.length, 'the setItem calls could not be found');
  writes.forEach(k=>assert.ok(['HI_KEY','LANG_KEY','SOUND_KEY'].includes(k), `the room saves ${k}`));
  assert.ok(!/getItem\([^)]*scripts/.test(DINOJS), 'the room reads saved blocks back');
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
  assert.ok(!/COSTUMES\.animate/.test(DINOJS), 'the room still animates the costumes');
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
test('the Bird, at head height, hits a standing Dino and misses a ducking one', ()=>{
  const L=DINO.NUM.LANE;
  const stand=wearing('dino/dino', -12, 0), duck=wearing('dino/ducking', -12, 0);
  assert.strictEqual(COSTUMES.touching(stand, wearing('desert/bird', -11.5, L)),   true,  'mid bird, standing');
  assert.strictEqual(COSTUMES.touching(duck,  wearing('desert/bird', -11.5, L)),   false, 'mid bird, ducking');
});

/* ====================================================== playing it */
const LEAD = 16;             // how many frames before a cactus the test player jumps
function play(seed, lead, seconds){
  const d=desert(seed);
  d.VM.greenFlag();
  while(d.VM.running && d.seconds<seconds){
    if(lead!=null) player(d, lead);
    d.step();
  }
  return d;
}
test('a player who jumps on time survives two minutes, getting faster all the way', ()=>{
  [1,2,3].forEach(seed=>{
    const d=play(seed, LEAD, 120);
    assert.ok(d.VM.running, `seed ${seed}: crashed at ${d.seconds.toFixed(1)}s`);
    assert.ok(+d.VM.project.vars.speed > DINO.NUM.SPEED*3, 'the game did not get faster');
    assert.ok(+d.VM.project.vars.score > 1400, 'the score did not count up');
  });
});
test('in a real game all four come out, and never two in the same place', ()=>{
  const d=desert(7);
  const seen=new Set(), counted=new Set();
  d.VM.greenFlag();
  while(d.VM.running && d.seconds<120){
    player(d, LEAD); d.step();
    const on=d.obstacles();
    on.forEach(o=>{ if(!counted.has(o)){ counted.add(o); seen.add(o.name); } });
    /* two copies on the screen never share a stretch of ground */
    const r=on.map(o=>d.COSTUMES.rect(o)).sort((a,b)=>a.x0-b.x0);
    for(let i=1;i<r.length;i++)
      assert.ok(r[i].x0 > r[i-1].x1, `two obstacles overlap at ${d.seconds.toFixed(1)}s`);
  }
  assert.ok(d.VM.running, `the player crashed at ${d.seconds.toFixed(1)}s`);
  OBST.forEach(o=>assert.ok(seen.has(o.name), `no ${o.name} ever came out`));
});

test('the timing matters: jumping far too early or far too late loses', ()=>{
  const late=play(4, 0, 60), early=play(4, 40, 60);
  assert.ok(!late.VM.running, 'jumping on contact still survived');
  assert.ok(!early.VM.running, 'jumping from miles away still survived');
});
test('a player who does nothing crashes into the first obstacle', ()=>{
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
