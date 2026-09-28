/* =====================================================================
   DINO RUN — the whole game, out of the same blocks.

   The runner every browser has for when the internet is down: a dinosaur
   running along a desert line, cactuses and birds coming at it, faster
   and faster until it hits one. Built here the way Pong is built — as
   ordinary objects with ordinary scripts on them, and nothing underneath
   doing the interesting part.

   AND THE SCRIPTS ARE AS SHORT AS THEY CAN BE AND STILL BE THE GAME:

     Dino          when SPACE is pressed and it is on the ground: glide up,
                   glide down. Forever: ↓ held means the ducking picture.
     Small Cactus  \  the same two scripts each. The hidden original waits
     Big Cactus     | until `next` is its number and makes a copy of itself;
     Cactus Group   | the copy slides left at `speed`, ends the game if it
     Bird          /  touches the Dino, and deletes itself off the screen.
     Ground        slides left and jumps back every 32 squares so the line
                   never runs out, counts `score`, speeds up a little every
                   frame, and picks `next` — which of the four comes out,
                   and when — so two never come out on top of each other.

   WHAT THE ROOM OWNS is the boring half, the same division Pong draws:
   the sky, the clouds, the camera, and a scoreboard that shows what the
   student's own `score` variable says. It never moves the Dino, never
   ends the game and never decides a hit counts. It only WATCHES — to play
   the sounds, to keep the high score, to turn night on at 700 — and none
   of that is a rule of the game.
   ===================================================================== */
window.DINO = (function(){
  const $ = s => document.querySelector(s);
  const T = (s,p) => (window.t ? t(s,p) : s);

  const DINO='Dino', GROUND='Ground';
  /* THE FOUR THINGS IN THE WAY, one object each. `n` is the number `next`
     has to be for it to come out; `y` is how high it goes. The Bird flies
     at head height: duck under it, or jump it. */
  const LANE=1.3;
  const OBSTACLES=[
    { name:'Small Cactus', shape:'desert/cactus', n:1, y:0 },
    { name:'Big Cactus',   shape:'desert/big',    n:2, y:0 },
    { name:'Cactus Group', shape:'desert/group',  n:3, y:0 },
    { name:'Bird',         shape:'desert/bird',   n:4, y:LANE }
  ];
  const OLD_SAVES=['dino-run.scripts.v1','dino-run.scripts.v2','dino-run.scripts.v3'];
  const HI_KEY='dino-run.hi.v1',
        LANG_KEY='dino-run.lang', SOUND_KEY='dino-run.sound';

  /* ----------------------------------------------------- the numbers
     In squares, at 60 frames a second. */
  const START_X=-12;          // where the Dino runs
  const JUMP_Y=6, JUMP_T=0.35; // a jump: up to y 6 in 0.35 s, and back down
  const SPEED=0.3;            // squares a frame at the start…
  const SPEEDUP=0.0001;       // …and this much more every frame
  const SCORE=0.2;            // points a frame
  const GAP={ a:1, b:2.5 };   // seconds between one obstacle and the next
  const SPAWN_X=20, GONE_X=-20, TILE=32;

  /* EVERY OBJECT, where it starts and what it wears. The Dino first, so
     it is the first chip in the editor. The four originals wait, hidden,
     exactly where their copies start — so a copy needs no `go to`. */
  const CAST=[
    { name:DINO, shape:'dino/dino', x:START_X, y:0, visible:true, vars:{} },
    ...OBSTACLES.map(o=>({ name:o.name, shape:o.shape, x:SPAWN_X, y:o.y, visible:false, vars:{} })),
    { name:GROUND, shape:'desert/ground', x:0, y:0, visible:true, vars:{} }
  ];

  const AX = k => (window.BLOCKS ? BLOCKS.AXES.find(a=>a.v===k) : null);
  const wr = (a,k,v)=>{ const x=AX(k); if(a&&x) a[x.field]=x.sign*v; };
  const actor = n => (window.VM ? VM.actorByName(n) : null);
  const langY = a => -a.z;                      // the language's y, for the room's own reading

  /* ----------------------------------------------------- the palette
     Everything the game is made of and a little more, so there is
     something to reach for when changing it. */
  const PALETTE={
    locked:true,
    cats:['events','control','motion','looks','sensing','ops','data'],
    ops:[
      'event.flag','event.key','event.clone',
      'ctrl.wait','ctrl.repeat','ctrl.forever','ctrl.if','ctrl.ifelse',
      'ctrl.waitUntil','ctrl.repeatUntil','ctrl.stop','ctrl.clone','ctrl.delclone',
      'motion.goto','motion.glide','motion.changeBy','motion.setTo','motion.pos','motion.turn',
      'looks.shape','looks.show','looks.hide','looks.size','looks.say','looks.sayFor',
      'sense.key','sense.touch','sense.posOf','sense.timer',
      'op.add','op.sub','op.mul','op.div','op.random','op.lt','op.gt','op.eq',
      'op.and','op.or','op.not',
      'data.set','data.change','data.get'
    ]
  };
  /* WHAT A BLOCK ARRIVES SET TO, taken off the shelf — the game's own
     numbers, so a new block behaves like the ones already there. */
  const SET={
    'motion.glide':    { t:JUMP_T, x:START_X, y:JUMP_Y, z:1 },
    'motion.changeBy': { a:'y', n:1 },
    'motion.setTo':    { a:'y', n:0 },
    'motion.goto':     { x:START_X, y:0, z:1 },
    'motion.pos':      { a:'y' },
    'sense.key':       { k:'space' },
    'event.key':       { k:'space' },
    'sense.touch':     { o:DINO },
    'sense.posOf':     { a:'y', o:DINO },
    'ctrl.stop':       { w:'all' },
    'looks.shape':     { s:'dino/dino' },
    'looks.say':       { s:'Roar!' },
    'looks.sayFor':    { s:'Roar!', n:1 },
    'op.random':       { a:1, b:4 },
    'op.gt':           { b:0 },
    'op.lt':           { b:0 },
    'data.change':     { n:1 }
  };

  /* ================================================== the given game */
  const B=(op,args,body,body2)=>{ const b={ op, args:args||{} };
    if(body) b.body=body; if(body2) b.body2=body2; return b; };
  const IF=(c,body)=>B('ctrl.if',{ c }, body);
  const IFELSE=(c,yes,no)=>B('ctrl.ifelse',{ c }, yes, no);
  const v=name=>B('data.get',{ v:name });
  const become=s=>B('looks.shape',{ s });
  const minus=x=>B('op.sub',{ a:0, b:x });
  const slideLeft=()=>B('motion.changeBy',{ a:'x', n:minus(v('speed')) });

  function scripts(){
    const out={};
    /* ------------------------------------------------------ the Dino
       A jump is two glides: up, then back down to the ground. Only from
       the ground, or SPACE in mid-air would start another jump. */
    out[DINO]=[
      { hat:B('event.flag'), body:[
        B('motion.goto',{ x:START_X, y:0, z:1 }),
        B('ctrl.forever',{},[
          IFELSE(B('sense.key',{ k:'down' }), [ become('dino/ducking') ], [ become('dino/dino') ])
        ]) ]},
      { hat:B('event.key',{ k:'space' }), body:[
        IF(B('op.eq',{ a:B('motion.pos',{ a:'y' }), b:0 }), [
          B('motion.glide',{ t:JUMP_T, x:START_X, y:JUMP_Y, z:1 }),
          B('motion.glide',{ t:JUMP_T, x:START_X, y:0, z:1 })
        ]) ]}
    ];

    /* ------------------------------------------------ the four obstacles
       The same two scripts four times. The original stays hidden and only
       makes copies — one each time `next` comes up with its number, which
       it then sets back to 0 so one number is one copy. A copy starts where
       the original waits, slides left, and ends the game if it touches the
       Dino. */
    OBSTACLES.forEach(o=>{
      out[o.name]=[
        { hat:B('event.flag'), body:[
          B('looks.hide'),
          B('ctrl.forever',{},[
            B('ctrl.waitUntil',{ c:B('op.eq',{ a:v('next'), b:o.n }) }),
            B('data.set',{ v:'next', n:0 }),
            B('ctrl.clone')
          ]) ]},
        { hat:B('event.clone'), body:[
          B('looks.show'),
          B('ctrl.repeatUntil',{ c:B('op.lt',{ a:B('motion.pos',{ a:'x' }), b:GONE_X }) }, [
            slideLeft(),
            IF(B('sense.touch',{ o:DINO }), [ B('ctrl.stop',{ w:'all' }) ])
          ]),
          B('ctrl.delclone')
        ]}
      ];
    });

    /* ----------------------------------------------------- the Ground
       The world moving past, a little faster every frame. Its second
       script says what comes next: a number from 1 to 4, then a gap. */
    out[GROUND]=[
      { hat:B('event.flag'), body:[
        B('data.set',{ v:'speed', n:SPEED }),
        B('data.set',{ v:'score', n:0 }),
        B('ctrl.forever',{},[
          slideLeft(),
          IF(B('op.lt',{ a:B('motion.pos',{ a:'x' }), b:-TILE }), [ B('motion.changeBy',{ a:'x', n:TILE }) ]),
          B('data.change',{ v:'score', n:SCORE }),
          B('data.change',{ v:'speed', n:SPEEDUP })
        ]) ]},
      { hat:B('event.flag'), body:[
        B('ctrl.forever',{},[
          B('data.set',{ v:'next', n:B('op.random',{ a:1, b:OBSTACLES.length }) }),
          B('ctrl.wait',{ n:B('op.random',{ a:GAP.a, b:GAP.b }) })
        ]) ]}
    ];
    return out;
  }
  const NAMES=CAST.map(c=>c.name);
  const OBST_NAMES=OBSTACLES.map(o=>o.name);

  /* ============================================================ words
     English is the key and Spanish the value, the way strings.js does it
     for the rest of the framework. Block words stay English: they are the
     code, and keys stay the names printed on the keyboard. */
  Object.assign(window.ES = window.ES || {}, {
    'DINO RUN':'DINO RUN',
    'A WHOLE GAME, BUILT OUT OF BLOCKS':'UN JUEGO ENTERO, HECHO CON BLOQUES',
    'Run as far as you can. Jump over the cactuses and duck under the birds. The longer you run, the faster it gets.':
      'Corre lo más lejos que puedas. Salta los cactus y agáchate debajo de los pájaros. Cuanto más corres, más rápido va.',
    'jump':'saltar','duck':'agacharse','open the blocks':'abrir los bloques',
    'Every rule of this game is a block. Click the <b>Dino</b>, a <b>cactus</b> or the <b>ground</b> — or press <b>C</b> — to read the code that makes it work. Change a number, then play again.':
      'Cada regla de este juego es un bloque. Haz clic en el <b>Dino</b>, en un <b>cactus</b> o en el <b>suelo</b> — o presiona <b>C</b> — para leer el código que lo hace funcionar. Cambia un número y vuelve a jugar.',
    'TRY THIS':'PRUEBA ESTO',
    '<b>Moon jump.</b> On the Dino, change the <code>y 6</code> in the first <code>glide</code> to <code>9</code>.':
      '<b>Salto lunar.</b> En el Dino, cambia el <code>y 6</code> del primer <code>glide</code> a <code>9</code>.',
    '<b>Quick jump.</b> Change the <code>0.35</code> in both <code>glide</code> blocks to <code>0.2</code>.':
      '<b>Salto rápido.</b> Cambia el <code>0.35</code> de los dos bloques <code>glide</code> a <code>0.2</code>.',
    '<b>Fast start.</b> On the Ground, change <code>set speed to 0.3</code> to <code>0.6</code>.':
      '<b>Salida rápida.</b> En el Ground (suelo), cambia <code>set speed to 0.3</code> a <code>0.6</code>.',
    '<b>Only birds.</b> On the Ground, change <code>pick random 1 to 4</code> to <code>4 to 4</code>.':
      '<b>Solo pájaros.</b> En el Ground (suelo), cambia <code>pick random 1 to 4</code> a <code>4 to 4</code>.',
    '<b>Can’t lose?</b> Take <code>stop all</code> out of the Bird. What happens?':
      '<b>¿Imposible perder?</b> Quita <code>stop all</code> del Bird (pájaro). ¿Qué pasa?',
    'Your changes last until you refresh the page. <b>↺</b> puts the original game back.':
      'Tus cambios duran hasta que recargues la página. <b>↺</b> devuelve el juego original.',
    'Play ▶':'Jugar ▶',
    'BLOCKS':'BLOQUES','RUN':'JUGAR','STOP':'PARAR',
    'Show the instructions again':'Ver las instrucciones otra vez',
    'Sound on':'Sonido activado','Sound off':'Sonido apagado',
    'Put the original game back':'Devolver el juego original',
    'Put the original game back? Your changes to the blocks will be thrown away.':
      '¿Devolver el juego original? Se borrarán tus cambios en los bloques.',
    'Press <b>SPACE</b> to play':'Presiona <b>SPACE</b> (espacio) para jugar',
    'GAME OVER':'FIN DEL JUEGO',
    '<b>SPACE</b> to play again':'<b>SPACE</b> (espacio) para jugar otra vez',
    'Play again':'Jugar otra vez',
    'Tap to play':'Toca para jugar','Tap to play again':'Toca para jugar otra vez',
    'STOPPED':'DETENIDO',
    'The program stopped, but the Dino did not crash.':'El programa se detuvo, pero el Dino no chocó.',
    'Run again':'Jugar otra vez',
    'Dino Run could not start':'Dino Run no pudo arrancar',
    'Try a different browser, or ask a teacher.':'Prueba otro navegador o pregúntale al maestro.'
  });

  /* ==================================================== the scene
     A sky the colour of the page and a few clouds drifting across it.
     The clouds are scenery, not objects: nothing in the game touches
     them, so there is nothing about them to program. */
  let clouds=[];
  function build(){
    if(G.roomGroup) G.scene.remove(G.roomGroup);
    G.roomGroup=new THREE.Group(); G.scene.add(G.roomGroup);
    G.solids=[]; G.hits=[]; G.ceiling=null; G.ground=()=>0;
    G.scene.background=new THREE.Color(COSTUMES.PAPER);
    G.scene.fog=null;
    clouds=[];
    for(let i=0;i<4;i++){
      const c=COSTUMES.make('desert/cloud');
      c.position.set(-18+i*11+Math.random()*6, 0.5, -(4.5+Math.random()*4));
      c.scale.setScalar(1.2);
      G.roomGroup.add(c); clouds.push(c);
    }
  }
  function drift(){
    const sp=Math.max(0, numVar('speed'));
    clouds.forEach(c=>{
      c.position.x -= sp*0.2;
      if(c.position.x < -26){ c.position.x = 26+Math.random()*8; c.position.z=-(4.5+Math.random()*4); }
    });
  }

  /* ==================================================== the three */
  function cast(){
    CAST.forEach(c=>{
      const a=VM.addActor({ name:c.name, shape:c.shape, colour:COSTUMES.INK, size:1 });
      a.dir=0; a.tilt=0; a.roll=0; a.visible=c.visible;
      wr(a,'x',c.x); wr(a,'y',c.y); a.y=1;
      a.vars=Object.assign({}, c.vars);
      VM.sync(a); VM.setHome(a);
    });
    VM.project.vars.speed=SPEED;
    VM.project.vars.score=0;
    VM.project.vars.next=0;
  }

  /* ------------------------------------------------- nothing is kept
     Every page load is the original game. A student's changes last until
     the page is refreshed, and ↺ puts the original back before that. */
  function given(){
    const all=scripts();
    NAMES.forEach(n=>{ const a=actor(n); if(a) a.scripts=JSON.parse(JSON.stringify(all[n])); });
  }
  /* earlier versions kept a student's blocks in the browser; clear them */
  function forget(){
    OLD_SAVES.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });
  }
  function original(){
    if(!confirm(T('Put the original game back? Your changes to the blocks will be thrown away.'))) return;
    VM.stopAll();
    given();
    VM.project.actors.filter(a=>a.isClone).slice().forEach(a=>VM.delActor(a));
    NAMES.forEach(n=>VM.resetActor(actor(n)));
    over=null; message();
    if(window.CODER) CODER.render();
  }

  /* ======================================================== sounds
     Three beeps, made on the spot: a jump, every hundred, and a crash.
     No files, so nothing to fetch on a machine with no network. */
  const SND=(function(){
    let ctx=null, on=true;
    try{ on=localStorage.getItem(SOUND_KEY)!=='off'; }catch(e){}
    function ac(){
      if(!ctx){ const A=window.AudioContext||window.webkitAudioContext; if(!A) return null;
        try{ ctx=new A(); }catch(e){ return null; } }
      if(ctx.state==='suspended') ctx.resume();
      return ctx;
    }
    function tone(f0, f1, dur, type, vol, delay){
      if(!on) return;
      const c=ac(); if(!c) return;
      const t0=c.currentTime+(delay||0);
      const o=c.createOscillator(), g=c.createGain();
      o.type=type||'square';
      o.frequency.setValueAtTime(f0,t0);
      if(f1) o.frequency.exponentialRampToValueAtTime(f1,t0+dur);
      g.gain.setValueAtTime(vol||0.04,t0);
      g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0+dur+0.02);
    }
    return {
      wake(){ if(on) ac(); },
      jump(){ tone(420, 780, 0.08, 'square', 0.035); },
      point(){ tone(880, 0, 0.07, 'square', 0.03); tone(1320, 0, 0.11, 'square', 0.03, 0.08); },
      crash(){ tone(190, 60, 0.3, 'sawtooth', 0.05); },
      get on(){ return on; },
      set on(v){ on=!!v; try{ localStorage.setItem(SOUND_KEY, on?'on':'off'); }catch(e){} }
    };
  })();

  /* ==================================================== watching
     THE ROOM'S ONLY JUDGEMENTS, and they are measurements, not rules.
     Whether the Dino crashed is asked with the same pixel test its own
     `touching` block uses, so the room and the program cannot disagree. */
  const numVar = k => { const n=parseFloat(VM.project.vars[k]); return isFinite(n)?n:0; };
  const crashed = ()=>{
    const d=actor(DINO); if(!d) return false;
    return VM.project.actors.some(o=>OBST_NAMES.includes(o.name) && o.visible!==false &&
      COSTUMES.touching(d,o)===true);
  };
  let hi=0; try{ hi=parseFloat(localStorage.getItem(HI_KEY))||0; }catch(e){}
  let over=null, lastRun=-1, wasRunning=false, wasUp=false;
  let nextHundred=100, flashT=0, lockUntil=0;

  function watch(){
    const running=VM.running;
    if(running && VM.runId!==lastRun){           // a fresh press of Run
      lastRun=VM.runId; over=null; nextHundred=100; message();
    }
    const sc=numVar('score');
    if(running && sc>=nextHundred){
      nextHundred=(Math.floor(sc/100)+1)*100;
      flashT=0.9; SND.point();
    }
    const d=actor(DINO);
    const up = !!d && langY(d) > 0.001;
    if(running && up && !wasUp) SND.jump();
    wasUp=up;
    if(wasRunning && !running){                  // the program just stopped
      over = crashed() ? 'hit' : 'stopped';
      if(over==='hit') SND.crash();
      if(sc>hi){ hi=Math.floor(sc); try{ localStorage.setItem(HI_KEY, String(hi)); }catch(e){} }
      lockUntil=performance.now()+600;           // a mashed SPACE is not a restart
      message();
    }
    wasRunning=running;
  }

  /* ==================================================== the screen */
  const pad5 = n => String(Math.max(0,Math.floor(n))).padStart(5,'0').slice(-6);
  function board(dt){
    const el=$('#dnScore'); if(!el) return;
    const sc=numVar('score');
    if(flashT>0) flashT-=dt;
    const blink = flashT>0 && ((flashT*6)|0)%2===0;
    /* while it flashes it shows the hundred it reached, the way the
       original does, rather than a number that will not sit still */
    const shown = flashT>0 ? nextHundred-100 : sc;
    const html=`<span class="dn-hi">HI ${pad5(hi)}</span> <span class="dn-now${blink?' off':''}">${pad5(shown)}</span>`;
    if(el.innerHTML!==html) el.innerHTML=html;
    document.body.classList.toggle('night', Math.floor(sc/700)%2===1);
  }
  const touchy = () => !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
  function message(){
    const el=$('#dnMsg'); if(!el) return;
    if(VM.running){ el.innerHTML=''; el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if(over==='hit'){
      el.innerHTML=`<b class="dn-over">${T('GAME OVER')}</b>
        <button class="dn-again" id="dnAgain" title="${T('Play again')}" aria-label="${T('Play again')}">
          <svg viewBox="0 0 36 32" width="36" height="32" aria-hidden="true"><path fill="currentColor"
            d="M18 4a12 12 0 1 0 11.3 16h-4.4A8 8 0 1 1 18 8c2.2 0 4.1.9 5.6 2.3L19 15h11V4l-3.8 3.8A12 12 0 0 0 18 4z"/></svg>
        </button>
        <small>${T(touchy() ? 'Tap to play again' : '<b>SPACE</b> to play again')}</small>`;
    } else if(over==='stopped'){
      el.innerHTML=`<b class="dn-over">${T('STOPPED')}</b>
        <small>${T('The program stopped, but the Dino did not crash.')}</small>
        <button class="dn-btn" id="dnAgain">▶ ${T('Run again')}</button>`;
    } else {
      el.innerHTML=`<small class="dn-start">${T(touchy() ? 'Tap to play' : 'Press <b>SPACE</b> to play')}</small>`;
    }
    const again=$('#dnAgain'); if(again) again.onclick=go;
  }
  function buttons(){
    const run=$('#dnRun');
    if(run){ const live=VM.running, label=live ? '■ '+T('STOP') : '▶ '+T('RUN');
      if(run.textContent!==label) run.textContent=label;
      run.classList.toggle('live', live); }
  }
  function words(){
    const set=(s,h)=>{ const e=$(s); if(e) e.innerHTML=h; };
    set('#dnOpen', '▦ '+T('BLOCKS')+' <small>C</small>');
    set('#dnLang', LANG_BTN());
    const snd=$('#dnSound');
    if(snd){ snd.textContent = SND.on ? '🔊' : '🔇'; snd.title = T(SND.on ? 'Sound on' : 'Sound off'); }
    const help=$('#dnHelp'); if(help) help.title=T('Show the instructions again');
    const rst=$('#dnReset'); if(rst) rst.title=T('Put the original game back');
    brief(); message(); buttons();
  }
  const LANG_BTN = () => window.LANG==='es' ? '🌐 English' : '🌐 Español';
  function brief(){
    const el=$('#dnBrief .card'); if(!el) return;
    const tries=[
      '<b>Moon jump.</b> On the Dino, change the <code>y 6</code> in the first <code>glide</code> to <code>9</code>.',
      '<b>Quick jump.</b> Change the <code>0.35</code> in both <code>glide</code> blocks to <code>0.2</code>.',
      '<b>Fast start.</b> On the Ground, change <code>set speed to 0.3</code> to <code>0.6</code>.',
      '<b>Only birds.</b> On the Ground, change <code>pick random 1 to 4</code> to <code>4 to 4</code>.',
      '<b>Can’t lose?</b> Take <code>stop all</code> out of the Bird. What happens?'
    ];
    el.innerHTML=`
      <div class="dn-lang"><button class="dn-btn" id="dnLang2">${LANG_BTN()}</button></div>
      <h1>${T('DINO RUN')}</h1>
      <p class="kick">${T('A WHOLE GAME, BUILT OUT OF BLOCKS')}</p>
      <p>${T('Run as far as you can. Jump over the cactuses and duck under the birds. The longer you run, the faster it gets.')}</p>
      <div class="dn-keys">
        <div><kbd>SPACE</kbd> <span>${T('jump')}</span></div>
        <div><kbd>↓</kbd> <span>${T('duck')}</span></div>
        <div><kbd>C</kbd> <span>${T('open the blocks')}</span></div>
      </div>
      <p>${T('Every rule of this game is a block. Click the <b>Dino</b>, a <b>cactus</b> or the <b>ground</b> — or press <b>C</b> — to read the code that makes it work. Change a number, then play again.')}</p>
      <p class="kick">${T('TRY THIS')}</p>
      <ol>${tries.map(s=>`<li>${T(s)}</li>`).join('')}</ol>
      <p class="dn-note">${T('Your changes last until you refresh the page. <b>↺</b> puts the original game back.')}</p>
      <div class="row"><button class="btn good" id="dnGo">${T('Play ▶')}</button></div>`;
    $('#dnGo').onclick=closeBrief;
    $('#dnLang2').onclick=toggleLang;
  }
  const briefOpen = () => { const b=$('#dnBrief'); return !!b && !b.classList.contains('hidden'); };
  function closeBrief(){ $('#dnBrief').classList.add('hidden'); SND.wake(); }
  function setLang(l){
    window.LANG = l==='es' ? 'es' : 'en';
    document.documentElement.lang=window.LANG;
    try{ localStorage.setItem(LANG_KEY, window.LANG); }catch(e){}
    words();
    if(window.CODER && CODER.open) CODER.render();
  }
  const toggleLang = () => setLang(window.LANG==='es' ? 'en' : 'es');

  /* ==================================================== the camera
     STRAIGHT DOWN AND ORTHOGRAPHIC, like Pong's — from up here x runs
     across and y runs up the screen, which is exactly a side-on runner.
     It is framed on a WINDOW of the world rather than on the objects: the
     Dino, the ground under it and the stretch of desert coming at it. And
     while the editor is open that window is fitted into the gap between
     the two panels, so a changed number can be run and watched without
     closing anything. */
  const VIEW   ={ x0:-15.5, x1:17,  y0:-2.5, y1:9 };
  const CODING ={ x0:-14.5, x1:5,   y0:-2,   y1:7 };
  let cam=null;
  function gap(){
    const W=innerWidth, H=innerHeight;
    if(window.CODER && CODER.open){
      const p=$('#cPal'), s=$('#cScript'), bar=$('#cBar');
      const l=p ? p.getBoundingClientRect().right+8 : 0;
      const r=s ? s.getBoundingClientRect().left-8 : W;
      const t=bar ? bar.getBoundingClientRect().bottom+8 : 0;
      if(r-l > 180) return { l, t, r, b:H-10, coding:true };
    }
    return { l:0, t:0, r:W, b:H, coding:false };
  }
  function camera(){
    const W=innerWidth, H=Math.max(1,innerHeight);
    const R=gap(), win=R.coding ? CODING : VIEW;
    const rw=Math.max(1,R.r-R.l), rh=Math.max(1,R.b-R.t);
    const u=Math.max((win.x1-win.x0)/rw, (win.y1-win.y0)/rh);     // squares per pixel
    const xc=(win.x0+win.x1)/2, yc=(win.y0+win.y1)/2;
    const cx=(R.l+R.r)/2, cy=(R.t+R.b)/2;
    if(!cam) cam=new THREE.OrthographicCamera(-1,1,1,-1,0.1,400);
    cam.left=xc-cx*u; cam.right=cam.left+W*u;
    cam.top=yc+cy*u;  cam.bottom=cam.top-H*u;
    cam.position.set(0,120,0); cam.up.set(0,0,-1); cam.lookAt(0,0,0);
    cam.updateProjectionMatrix();
    G.camera=cam;
    /* the scoreboard and the message sit in the same window */
    const sc=$('#dnScore'), msg=$('#dnMsg');
    if(sc){
      let top=R.t+(R.coding?6:16);
      /* on a narrow screen the buttons wrap under themselves and reach
         across; the score goes underneath them rather than on top */
      const bar=$('#dnTop');
      if(!R.coding && bar){ const b=bar.getBoundingClientRect();
        if(b.right+12 > W-16-sc.offsetWidth) top=Math.max(top, b.bottom+12); }
      sc.style.right=(W-R.r+16)+'px'; sc.style.top=top+'px';
    }
    if(msg){ msg.style.left=((R.l+R.r)/2)+'px'; msg.style.top=(R.t+rh*0.3)+'px';
             msg.style.maxWidth=Math.max(160, rw-24)+'px'; }
  }
  /* where a point on the screen is in the language's squares */
  function world(ev){
    const c=$('#view').getBoundingClientRect();
    const fx=(ev.clientX-c.left)/c.width, fy=(ev.clientY-c.top)/c.height;
    return { x:cam.left+fx*(cam.right-cam.left), y:cam.top-fy*(cam.top-cam.bottom) };
  }

  /* CLICK A THING AND READ IT. The Dino first, then whatever is coming
     at it, then the ground — tested on the picture's own pixels, and then
     a little more loosely so a thin line of ground can still be clicked. */
  function pickAt(ev){
    if(!cam || briefOpen()) return;
    /* A FINGER IS A SPACE BAR. On a touch screen there is no keyboard,
       so a tap on the desert holds SPACE down for as long as the finger
       is there — the Dino's own `key space pressed?` does the rest. */
    if(ev.pointerType==='touch'){
      ev.preventDefault();
      G.keys.Space=true;
      if(!VM.running && performance.now()>=lockUntil) go();
      return;
    }
    if(window.CODER && CODER.open) return;
    const p=world(ev);
    const order=NAMES;
    const cands=VM.project.actors.filter(a=>a.visible!==false)
      .sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name));
    let a=cands.find(o=>COSTUMES.hit(o,p.x,p.y)) ||
          cands.find(o=>COSTUMES.hit(o,p.x,p.y,true));
    if(!a) return;
    if(a.isClone) a=actor(a.name);               // a copy's code IS the original's
    if(a && window.CODER){ CODER.setActor(a); CODER.show(); }
  }

  /* ==================================================== playing */
  function go(){
    if(VM.running) return;
    /* a button still holding the focus is a button SPACE presses again —
       and the next SPACE is meant for jumping */
    const f=document.activeElement;
    if(f && f.tagName==='BUTTON') f.blur();
    SND.wake();
    VM.greenFlag();
  }
  const typing = el => !!(el && (el.tagName==='INPUT' || el.tagName==='TEXTAREA' ||
                                 el.tagName==='SELECT' || el.isContentEditable));
  function keys(e){
    if(typing(e.target)) return;
    if(e.code!=='Space') return;
    if(briefOpen()){ if(e.code==='Space' && !e.repeat){ e.preventDefault(); closeBrief(); } return; }
    /* the editor being open is no reason not to play: change a number,
       press SPACE, and watch it in the gap between the two panels */
    if(VM.running || e.repeat || performance.now()<lockUntil) return;
    e.preventDefault();
    go();
  }

  /* ==================================================== in */
  let on=false;
  function start(){
    on=true;
    G.room='dino';
    /* `touching edge` measures against the room's walls; these are the
       edges of the stretch of desert on screen */
    window.LEVELS=Object.assign(window.LEVELS||{}, { dino:{ w:35, d:21 } });
    build();
    VM.useScratch();
    VM.enter(G.roomGroup);
    VM.project.actors.slice().forEach(a=>VM.delActor(a));
    cast();
    given();
    forget();
    camera();
    if(window.CODER){
      CODER.restrict(Object.assign({ defaults:SET }, PALETTE));
      CODER.setActor(actor(DINO));
    }
    $('#view').addEventListener('pointerdown', pickAt);
    const lift=ev=>{ if(ev.pointerType==='touch') G.keys.Space=false; };
    addEventListener('pointerup', lift); addEventListener('pointercancel', lift);
    addEventListener('keydown', keys);
    addEventListener('pointerdown', ()=>SND.wake(), { once:true });
    $('#dnOpen').onclick=()=>{ if(window.CODER){ CODER.setActor(actor(DINO)); CODER.toggle(); } };
    $('#dnRun').onclick=()=>{ if(VM.running) VM.stopAll(); else go(); };
    $('#dnHelp').onclick=()=>$('#dnBrief').classList.remove('hidden');
    $('#dnSound').onclick=()=>{ SND.on=!SND.on; if(SND.on) SND.wake(); words(); };
    $('#dnLang').onclick=toggleLang;
    $('#dnReset').onclick=original;
    document.querySelectorAll('#dnTop .dn-btn').forEach(b=>b.addEventListener('click', ()=>b.blur()));
    let l='en'; try{ l=localStorage.getItem(LANG_KEY)||'en'; }catch(e){}
    setLang(l);
  }

  /* ONE STEP OF THE GAME, sixty times a second whatever the screen does:
     the programs, and the room watching them */
  function step(dt){
    if(!on) return;
    VM.step(dt);
    /* everything lives at one height, so `touching` is a flat question
       and a stray `change z by` cannot lift a thing out of sight */
    VM.project.actors.forEach(a=>{ if(a.y!==1){ a.y=1; VM.sync(a); } });
    if(VM.running) drift();
    watch();
  }
  /* AND ONCE PER PICTURE: the camera and the HUD */
  function draw(dt){
    if(!on) return;
    camera();
    if(window.CODER) CODER.tick(dt);
    const coding=!!(window.CODER && CODER.open);
    const hud=$('#dino'); if(hud) hud.classList.toggle('coding', coding);
    board(dt); buttons();
  }

  return { start, step, draw, scripts, given, setLang,
           DINO, GROUND, OBSTACLES, CAST, PALETTE, SET,
           NUM:{ START_X, JUMP_Y, JUMP_T, SPEED, SPEEDUP, SCORE, GAP, LANE, SPAWN_X, GONE_X, TILE },
           get active(){ return on; },
           get over(){ return over; },
           get hi(){ return hi; },
           crashed };
})();
