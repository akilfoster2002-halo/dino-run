/* =====================================================================
   DINO RUN — a finished game, and nothing hidden behind it.

   The one claim the room makes is the one Pong makes: EVERY RULE OF THE
   GAME IS A BLOCK. The jump, gravity, landing, ducking, the crash, what
   comes next, how fast it comes and the score are all on a shelf a
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
test('the Dino jumps: SPACE or ↑ sets `jump`, but only on the ground', ()=>{
  const loop=loopOf(hat(DINO.DINO,'event.flag'));
  const ground=loop.body.find(b=>b.op==='ctrl.if' && has(b.args.c,'motion.pos') && b.args.c.op==='op.eq');
  assert.ok(ground, 'nothing asks whether the Dino is on the ground, so it can jump in mid-air for ever');
  const press=all(ground.body).find(b=>b.op==='ctrl.if' && has(b.args.c,'sense.key'));
  assert.ok(press, 'no key makes it jump');
  const keys=all([press.args.c]).filter(b=>b.op==='sense.key').map(b=>b.args.k);
  assert.deepStrictEqual(keys.sort(), ['space','up']);
  assert.ok(press.body.some(b=>b.op==='data.set' && b.args.v==='jump' && b.args.n>0), 'a jump that sets no speed');
});

test('gravity is a block: `jump` gets smaller every frame and moves the Dino', ()=>{
  const loop=loopOf(hat(DINO.DINO,'event.flag'));
  const move=loop.body.find(b=>b.op==='motion.changeBy' && b.args.a==='y');
  assert.ok(move && move.args.n.op==='data.get' && move.args.n.args.v==='jump', 'the Dino is not moved by `jump`');
  const g=loop.body.find(b=>b.op==='data.change' && b.args.v==='jump');
  assert.ok(g && g.args.n<0, 'nothing pulls it back down');
});

test('the Dino lands: below the ground it is put back on it', ()=>{
  const loop=loopOf(hat(DINO.DINO,'event.flag'));
  const land=loop.body.find(b=>b.op==='ctrl.if' && b.args.c.op==='op.lt' && has(b.args.c,'motion.pos'));
  assert.ok(land, 'nothing notices the Dino has gone through the floor');
  assert.ok(land.body.some(b=>b.op==='motion.setTo' && b.args.a==='y' && b.args.n===0));
  assert.ok(land.body.some(b=>b.op==='data.set' && b.args.v==='jump' && b.args.n===0));
});

test('each obstacle is an object of its own, wearing its own picture', ()=>{
  assert.deepStrictEqual(Array.from(OBST, o=>o.name), ['Small Cactus','Big Cactus','Cactus Group','Bird']);
  OBST.forEach(o=>{
    const c=DINO.CAST.find(x=>x.name===o.name);
    assert.ok(c, `${o.name} is not in the cast`);
    assert.strictEqual(c.shape, o.shape);
    assert.ok(COSTUMES.isModel(o.shape), `${o.name} wears ${o.shape}, which is not a costume`);
    assert.strictEqual(c.visible, false, `${o.name}'s spawner would be sitting on the screen`);
    assert.ok(!blocks(o.name).some(b=>b.op==='looks.shape'), `${o.name} changes into something else`);
  });
  assert.strictEqual(new Set(OBST.map(o=>o.shape)).size, OBST.length, 'two obstacles wear the same picture');
});

test('↓ ducks, and touching any of the four ends the game', ()=>{
  const loop=loopOf(hat(DINO.DINO,'event.flag'));
  const duck=loop.body.find(b=>b.op==='ctrl.ifelse' && has(b.args.c,'sense.key'));
  assert.ok(duck && duck.args.c.args.k==='down', 'no ducking on ↓');
  assert.strictEqual(duck.body[0].args.s, 'dino/ducking');
  OBST.forEach(o=>{
    const crash=loop.body.find(b=>b.op==='ctrl.if' && b.args.c.op==='sense.touch' && b.args.c.args.o===o.name);
    assert.ok(crash, `the Dino never checks whether it touched the ${o.name}`);
    assert.ok(crash.body.some(b=>b.op==='looks.shape' && b.args.s==='dino/crashed'), 'no crashed picture');
    assert.ok(crash.body.some(b=>b.op==='ctrl.stop' && b.args.w==='all'), `touching the ${o.name} does not end the game`);
  });
});

test('each obstacle waits for its own number, makes one copy, and the copy slides away', ()=>{
  assert.deepStrictEqual(OBST.map(o=>o.n).sort(), OBST.map((o,i)=>i+1), 'the numbers are not 1, 2, 3, 4');
  OBST.forEach(o=>{
    const flag=hat(o.name,'event.flag');
    assert.ok(flag.body.some(b=>b.op==='looks.hide'), `${o.name}: the spawner is not hidden`);
    const loop=loopOf(flag);
    const wait=loop.body.find(b=>b.op==='ctrl.waitUntil');
    assert.ok(wait && wait.args.c.op==='op.eq' && wait.args.c.args.a.args.v==='next' && wait.args.c.args.b===o.n,
      `${o.name} does not wait for next = ${o.n}`);
    assert.ok(loop.body.some(b=>b.op==='data.set' && b.args.v==='next' && b.args.n===0),
      `${o.name} never gives the turn back, so it would make a copy every frame`);
    assert.ok(has(loop,'ctrl.clone'), `${o.name} never makes a copy`);
    const clone=hat(o.name,'event.clone');
    assert.ok(clone, `${o.name}: a copy does nothing`);
    assert.ok(clone.body.some(b=>b.op==='looks.show'), `${o.name}: a copy of a hidden object stays hidden`);
    assert.ok(clone.body.some(b=>b.op==='ctrl.repeatUntil' && has(b,'motion.changeBy')), `${o.name}: a copy never moves`);
    assert.strictEqual(clone.body[clone.body.length-1].op, 'ctrl.delclone', `${o.name}: copies pile up for ever`);
  });
});

test('birds wait until the game is fast, and fly at one of three heights', ()=>{
  const loop=loopOf(hat('Bird','event.flag'));
  const gate=loop.body.find(b=>b.op==='ctrl.if' && b.args.c.op==='op.gt' && b.args.c.args.a.args.v==='speed');
  assert.ok(gate && has(gate,'ctrl.clone'), 'birds are not held back until the game is fast');
  const go=hat('Bird','event.clone').body.find(b=>b.op==='motion.goto');
  assert.ok(go && has(go.args.y,'op.random'), 'every bird flies at the same height');
  ['Small Cactus','Big Cactus','Cactus Group'].forEach(n=>
    assert.ok(!has(loopOf(hat(n,'event.flag')),'ctrl.if'), `${n} is held back like a bird`));
});

test('the Ground picks what comes next, and when', ()=>{
  const decide=S[DINO.GROUND].find(sc=>sc.hat.op==='event.flag' &&
    all(sc.body).some(b=>b.op==='data.set' && b.args.v==='next' && has(b,'op.random')));
  assert.ok(decide, 'nothing ever sets `next`, so nothing ever comes out');
  const pick=all(decide.body).find(b=>b.op==='data.set' && b.args.v==='next' && has(b,'op.random'));
  assert.strictEqual(pick.args.n.args.a, 1);
  assert.strictEqual(pick.args.n.args.b, OBST.length, 'some obstacle can never be picked');
  assert.ok(loopOf(decide).body.some(b=>b.op==='ctrl.wait' && has(b,'op.random')), 'every gap is the same gap');
});

test('the Ground scrolls, speeds the game up, and counts the score', ()=>{
  const loop=loopOf(hat(DINO.GROUND,'event.flag'));
  const speed=loop.body.find(b=>b.op==='data.set' && b.args.v==='speed');
  assert.ok(speed && has(speed,'sense.timer'), 'the game never gets faster');
  assert.ok(loop.body.some(b=>b.op==='ctrl.if' && b.body.some(x=>x.op==='data.set' && x.args.v==='speed')),
    'nothing stops it getting faster for ever');
  assert.ok(loop.body.some(b=>b.op==='ctrl.if' && b.body.some(x=>x.op==='motion.changeBy' && x.args.n===DINO.NUM.TILE)),
    'the ground runs out');
  assert.ok(loop.body.some(b=>b.op==='data.change' && b.args.v==='score'), 'nothing counts the score');
});

test('the room does not play the game: no rule is written in JavaScript', ()=>{
  const room=DINOJS.replace(/function scripts\(\)\{[\s\S]*?\n  \}\n/, '');
  assert.ok(!/stopAll\(\)[^;]*;[^\n]*crash/i.test(room), 'the room ends the game itself');
  assert.ok(!/vars\.score\s*[+\-]?=/.test(room.replace(/VM\.project\.vars\.score=0;/,'')),
    'the room writes the score');
  assert.ok(!/\.z\s*[+\-]=/.test(room), 'the room moves something up or down itself');
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
test('a bird at 1.3 hits a standing Dino and misses a ducking one; at 2.6 it misses both', ()=>{
  const L=DINO.NUM.LANE;
  const stand=wearing('dino/dino', -12, 0), duck=wearing('dino/ducking', -12, 0);
  assert.strictEqual(COSTUMES.touching(stand, wearing('desert/bird', -11.5, L)),   true,  'mid bird, standing');
  assert.strictEqual(COSTUMES.touching(duck,  wearing('desert/bird', -11.5, L)),   false, 'mid bird, ducking');
  assert.strictEqual(COSTUMES.touching(stand, wearing('desert/bird', -11.5, 2*L)), false, 'high bird, standing');
  assert.strictEqual(COSTUMES.touching(stand, wearing('desert/bird', -11.5, 0)),   true,  'low bird, standing');
});

/* ====================================================== playing it */
function play(seed, lead, seconds){
  const d=desert(seed);
  d.VM.greenFlag();
  while(d.VM.running && d.seconds<seconds){
    if(lead!=null) player(d, lead);
    d.step();
  }
  return d;
}
test('a player who jumps on time survives two minutes, all the way to top speed', ()=>{
  [1,2,3].forEach(seed=>{
    const d=play(seed, 8, 120);
    assert.ok(d.VM.running, `seed ${seed}: crashed at ${d.seconds.toFixed(1)}s`);
    assert.ok(+d.VM.project.vars.speed >= DINO.NUM.TOP - 1e-9, 'it never reached top speed');
    assert.ok(+d.VM.project.vars.score > 1500, 'the score did not count up');
  });
});
test('in a real game all four come out, and never two in the same place', ()=>{
  const d=desert(7);
  const seen=new Set(), counted=new Set();
  d.VM.greenFlag();
  while(d.VM.running && d.seconds<120){
    player(d, 8); d.step();
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
  const late=play(4, 0, 60), early=play(4, 30, 60);
  assert.ok(!late.VM.running, 'jumping on contact still survived');
  assert.ok(!early.VM.running, 'jumping from miles away still survived');
});
test('a player who does nothing crashes into the first obstacle', ()=>{
  const d=play(5, null, 30);
  assert.ok(!d.VM.running, 'nothing ended the game');
  assert.ok(d.seconds < 6, `it took ${d.seconds.toFixed(1)}s to crash`);
  assert.strictEqual(d.dino().shape, 'dino/crashed', 'the Dino did not put its crashed costume on');
});
test('a changed number changes the game: a bigger `jump` jumps higher', ()=>{
  const peak=(n)=>{
    const d=desert(6);
    const set=all(d.dino().scripts[0].body).find(b=>b.op==='data.set' && b.args.v==='jump' && b.args.n>0);
    set.args.n=n;
    d.VM.greenFlag(); d.G.keys.Space=true;
    let top=0;
    for(let i=0;i<120;i++){ d.step(); if(i===2) d.G.keys.Space=false; top=Math.max(top, -d.dino().z); }
    return top;
  };
  const normal=peak(DINO.NUM.JUMP), moon=peak(0.8);
  assert.ok(normal>3.5 && normal<5.5, `a normal jump peaks at ${normal.toFixed(2)}`);
  assert.ok(moon>normal*2, 'a bigger number did not jump higher');
});
