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
const NAMES = [DINO.DINO, DINO.OBST, DINO.GROUND];

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
test('all three objects arrive with a script that starts on Run', ()=>{
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

test('↓ ducks, and touching an Obstacle ends the game', ()=>{
  const loop=loopOf(hat(DINO.DINO,'event.flag'));
  const duck=loop.body.find(b=>b.op==='ctrl.ifelse' && has(b.args.c,'sense.key'));
  assert.ok(duck && duck.args.c.args.k==='down', 'no ducking on ↓');
  assert.strictEqual(duck.body[0].args.s, 'dino/ducking');
  const crash=loop.body.find(b=>b.op==='ctrl.if' && b.args.c.op==='sense.touch');
  assert.ok(crash && crash.args.c.args.o===DINO.OBST, 'the Dino never checks for an Obstacle');
  assert.ok(crash.body.some(b=>b.op==='ctrl.stop' && b.args.w==='all'), 'a crash that does not end the game');
});

test('the Obstacle is a hidden spawner, and every copy decides what it is', ()=>{
  const flag=hat(DINO.OBST,'event.flag');
  assert.ok(flag.body.some(b=>b.op==='looks.hide'), 'the spawner itself would be sitting on the screen');
  const loop=loopOf(flag);
  assert.ok(has(loop,'ctrl.clone'), 'it never makes a copy');
  assert.ok(loop.body.some(b=>b.op==='ctrl.wait' && has(b,'op.random')), 'every gap is the same gap');
  const clone=hat(DINO.OBST,'event.clone');
  assert.ok(clone, 'a copy does nothing');
  const becomes=all(clone.body).filter(b=>b.op==='looks.shape').map(b=>b.args.s);
  ['desert/cactus','desert/big','desert/group','desert/bird'].forEach(c=>
    assert.ok(becomes.includes(c), `nothing ever becomes ${c}`));
  assert.ok(all(clone.body).some(b=>b.op==='op.gt' && has(b.args.a,'data.get') && b.args.a.args.v==='speed'),
    'birds are not held back until the game is fast');
  assert.ok(clone.body.some(b=>b.op==='ctrl.repeatUntil' && has(b,'motion.changeBy')), 'a copy never moves');
  assert.strictEqual(clone.body[clone.body.length-1].op, 'ctrl.delclone', 'copies pile up for ever');
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
  const rows=COSTUMES.C['desert/ground'].frames.a;
  const period=Math.round(DINO.NUM.TILE/COSTUMES.PX);
  rows.forEach((r,j)=>{
    for(let i=0;i+period<r.length;i++)
      assert.strictEqual(r[i], r[i+period], `row ${j} has a seam at ${i}`);
  });
});

/* a stand-in object wearing a costume, for asking `touching` */
function wearing(cid, x, y, frame){
  const s={ cid, frame: frame || Object.keys(COSTUMES.C[cid].frames)[0] };
  return { shape:cid, x, z:-y, size:1, mesh:{ children:[{ userData:{ sprite:s } }] } };
}
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
  ['up','down'].forEach(f=>{
    assert.strictEqual(COSTUMES.touching(stand, wearing('desert/bird', -11.5, L,   f)), true,  'mid bird, standing ('+f+')');
    assert.strictEqual(COSTUMES.touching(duck,  wearing('desert/bird', -11.5, L,   f)), false, 'mid bird, ducking ('+f+')');
    assert.strictEqual(COSTUMES.touching(stand, wearing('desert/bird', -11.5, 2*L, f)), false, 'high bird, standing ('+f+')');
    assert.strictEqual(COSTUMES.touching(stand, wearing('desert/bird', -11.5, 0,   f)), true,  'low bird, standing ('+f+')');
  });
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
