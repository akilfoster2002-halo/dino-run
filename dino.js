/* =====================================================================
   DINO RUN — build the runner game yourself, out of blocks.

   Three objects, and only the Ground has code. Every refresh starts
   here: the Ground sliding along under the Dino, so the Dino looks like
   it is running from the first press of SPACE, and the Dino and a Cactus
   standing still, waiting for a student to write what they do. The
   finished game is small:

     Ground   slides left forever, jumps back every 32 squares so the line
              never runs out, and counts `score`
     Cactus   slides left forever, comes back at the right when it goes off
              the left, and ends the game if it touches the Dino
     Dino     when SPACE is pressed and it is on the ground: glide up,
              glide back down

   A teacher can open the page with ?answer to load that finished game.

   WHAT THE ROOM OWNS is the boring half, the same division Pong draws:
   the sky, the clouds, the camera, and a scoreboard that shows what the
   student's own `score` variable says. It never moves anything, never
   ends the game and never decides a hit counts. It only WATCHES — to play
   the sounds, to keep the high score, to turn night on at 700.
   ===================================================================== */
window.DINO = (function(){
  const $ = s => document.querySelector(s);
  const T = (s,p) => (window.t ? t(s,p) : s);

  const DINO='Dino', CACTUS='Cactus', GROUND='Ground';
  const OLD_SAVES=['dino-run.scripts.v1','dino-run.scripts.v2','dino-run.scripts.v3'];
  const NAME_KEY='dino-run.name';
  const HI_KEY='dino-run.hi.v1',
        LANG_KEY='dino-run.lang', SOUND_KEY='dino-run.sound';
  const teacher = typeof location!=='undefined' && /[?&]answer\b/.test(location.search);

  /* ----------------------------------------------------- the numbers
     The ones the answer key uses, in squares, at 60 frames a second. */
  const START_X=-12, CACTUS_X=10;
  const JUMP_Y=6, JUMP_T=0.35; // a jump: up to y 6 in 0.35 s, and back down
  const SPEED=0.3;             // how far the ground and the cactus slide each frame
  const SCORE=0.2;             // points a frame
  const SPAWN_X=20, GONE_X=-20, TILE=32;

  /* THE THREE OBJECTS, where they stand when the page opens */
  const CAST=[
    { name:DINO,   shape:'dino/dino',     x:START_X,  y:0, visible:true },
    { name:CACTUS, shape:'desert/cactus', x:CACTUS_X, y:0, visible:true },
    { name:GROUND, shape:'desert/ground', x:0,        y:0, visible:true }
  ];

  const AX = k => (window.BLOCKS ? BLOCKS.AXES.find(a=>a.v===k) : null);
  const wr = (a,k,v)=>{ const x=AX(k); if(a&&x) a[x.field]=x.sign*v; };
  const actor = n => (window.VM ? VM.actorByName(n) : null);
  const langY = a => -a.z;                      // the language's y, for the room's own reading

  /* ----------------------------------------------------- the palette
     What it takes to build the game, and not much more. */
  const PALETTE={
    locked:true,
    cats:['events','control','motion','looks','sensing','ops','data'],
    ops:[
      'event.flag','event.key','event.clone',
      'ctrl.wait','ctrl.repeat','ctrl.forever','ctrl.if','ctrl.ifelse','ctrl.stop',
      'ctrl.clone','ctrl.delclone',
      'motion.goto','motion.glide','motion.changeBy','motion.setTo','motion.pos',
      'looks.shape','looks.show','looks.hide','looks.say',
      'sense.key','sense.touch',
      'op.add','op.sub','op.random','op.lt','op.gt','op.eq',
      'data.set','data.change','data.get'
    ]
  };
  /* WHAT A BLOCK ARRIVES SET TO, taken off the shelf: numbers that work
     in this game, so a first try does something you can see */
  const SET={
    'motion.glide':    { t:JUMP_T, x:START_X, y:JUMP_Y, z:1 },
    'motion.changeBy': { a:'x', n:-SPEED },
    'motion.setTo':    { a:'x', n:SPAWN_X },
    'motion.goto':     { x:START_X, y:0, z:1 },
    'motion.pos':      { a:'x' },
    'sense.key':       { k:'space' },
    'event.key':       { k:'space' },
    'sense.touch':     { o:DINO },
    'ctrl.stop':       { w:'all' },
    'looks.shape':     { s:'dino/dino' },
    'looks.say':       { s:'Roar!' },
    'op.random':       { a:1, b:10 },
    'op.lt':           { b:GONE_X },
    'op.gt':           { b:0 },
    'data.set':        { n:0 },
    'data.change':     { n:SCORE }
  };

  /* ================================================== the code */
  const B=(op,args,body)=>{ const b={ op, args:args||{} }; if(body) b.body=body; return b; };
  const IF=(c,body)=>B('ctrl.if',{ c }, body);
  const pos=k=>B('motion.pos',{ a:k });

  /* WHAT A STUDENT IS HANDED: the Ground, already sliding and already
     wrapping, so the Dino looks like it runs; a worked example of the
     slide the Cactus needs too. The Dino and the Cactus get nothing, and
     the score is still the student's to count. */
  const starter = () => ({ [DINO]:[], [CACTUS]:[],
    [GROUND]:[{ hat:B('event.flag'), body:[
      B('data.set',{ v:'score', n:0 }),
      B('ctrl.forever',{},[
        B('motion.changeBy',{ a:'x', n:-SPEED }),
        IF(B('op.lt',{ a:pos('x'), b:-TILE }), [ B('motion.changeBy',{ a:'x', n:TILE }) ])
      ]) ]}] });

  /* THE ANSWER KEY, for a teacher: open the page with ?answer. */
  function answer(){
    const out={};
    out[DINO]=[
      { hat:B('event.flag'), body:[ B('motion.goto',{ x:START_X, y:0, z:1 }) ]},
      { hat:B('event.key',{ k:'space' }), body:[
        IF(B('op.eq',{ a:pos('y'), b:0 }), [
          B('motion.glide',{ t:JUMP_T, x:START_X, y:JUMP_Y, z:1 }),
          B('motion.glide',{ t:JUMP_T, x:START_X, y:0, z:1 })
        ]) ]}
    ];
    out[CACTUS]=[{ hat:B('event.flag'), body:[
      B('motion.goto',{ x:SPAWN_X, y:0, z:1 }),
      B('ctrl.forever',{},[
        B('motion.changeBy',{ a:'x', n:-SPEED }),
        IF(B('op.lt',{ a:pos('x'), b:GONE_X }), [ B('motion.setTo',{ a:'x', n:SPAWN_X }) ]),
        IF(B('sense.touch',{ o:DINO }), [ B('ctrl.stop',{ w:'all' }) ])
      ]) ]}];
    out[GROUND]=[{ hat:B('event.flag'), body:[
      B('data.set',{ v:'score', n:0 }),
      B('ctrl.forever',{},[
        B('motion.changeBy',{ a:'x', n:-SPEED }),
        IF(B('op.lt',{ a:pos('x'), b:-TILE }), [ B('motion.changeBy',{ a:'x', n:TILE }) ]),
        B('data.change',{ v:'score', n:SCORE })
      ]) ]}];
    return out;
  }
  const NAMES=CAST.map(c=>c.name);

  /* ============================================================ words
     English is the key and Spanish the value, the way strings.js does it
     for the rest of the framework. Block words stay English: they are the
     code, and keys stay the names printed on the keyboard. */
  Object.assign(window.ES = window.ES || {}, {
    'DINO RUN':'DINO RUN',
    'BUILD THE GAME OUT OF BLOCKS':'CONSTRUYE EL JUEGO CON BLOQUES',
    'The <b>Ground</b> already slides along, so the Dino looks like it is running. The <b>Dino</b> and the <b>Cactus</b> have no code yet. Click one — or press <b>C</b> — and write its blocks. Then press <b>SPACE</b> to play.':
      'El <b>Ground</b> (suelo) ya se desliza, así que parece que el Dino corre. El <b>Dino</b> y el <b>Cactus</b> todavía no tienen código. Haz clic en uno — o presiona <b>C</b> — y escribe sus bloques. Luego presiona <b>SPACE</b> (espacio) para jugar.',
    'play, then jump':'jugar, y luego saltar','open the blocks':'abrir los bloques',
    'WHAT TO BUILD':'QUÉ CONSTRUIR',
    '<b>Ground.</b> Already done: it slides left <code>forever</code> with <code>change x by -0.3</code>, and when <code>x position &lt; -32</code> it does <code>change x by 32</code> so it never runs out. Click it to read how.':
      '<b>Ground (suelo).</b> Ya está hecho: se desliza a la izquierda con <code>forever</code> y <code>change x by -0.3</code>, y cuando <code>x position &lt; -32</code> hace <code>change x by 32</code> para que nunca se acabe. Haz clic en él para ver cómo.',
    '<b>Cactus.</b> Slide it left the same way. When <code>x position &lt; -20</code>, <code>set x to 20</code> so it comes back.':
      '<b>Cactus.</b> Deslízalo a la izquierda igual. Cuando <code>x position &lt; -20</code>, <code>set x to 20</code> para que vuelva.',
    '<b>Dino.</b> <code>when space key pressed</code>: <code>glide</code> up to <code>y 6</code>, then <code>glide</code> back down to <code>y 0</code>.':
      '<b>Dino.</b> <code>when space key pressed</code>: <code>glide</code> hacia arriba hasta <code>y 6</code>, y luego <code>glide</code> de vuelta a <code>y 0</code>.',
    '<b>Game over.</b> On the Cactus: <code>if touching Dino?</code> then <code>stop all</code>.':
      '<b>Fin del juego.</b> En el Cactus: <code>if touching Dino?</code> entonces <code>stop all</code>.',
    '<b>Score.</b> On the Ground: <code>change score by 0.2</code> inside the <code>forever</code>.':
      '<b>Puntos.</b> En el Ground (suelo): <code>change score by 0.2</code> dentro del <code>forever</code>.',
    'Your code is cleared when you refresh the page. <b>↺</b> clears it too.':
      'Tu código se borra cuando recargas la página. <b>↺</b> también lo borra.',
    'Start coding ▶':'Empezar a programar ▶',
    'BLOCKS':'BLOQUES','RUN':'JUGAR','STOP':'PARAR',
    'Show the instructions again':'Ver las instrucciones otra vez',
    'Sound on':'Sonido activado','Sound off':'Sonido apagado',
    'Start again from the beginning':'Empezar otra vez desde el principio',
    'Throw away your code and start again?':'¿Borrar tu código y empezar otra vez?',
    'Teacher view — answer key loaded':'Vista del maestro — respuesta cargada',
    'DOWNLOAD SCRIPT':'DESCARGAR CÓDIGO',
    'Save the code of all three objects as one PDF, to hand in':
      'Guarda el código de los tres objetos en un solo PDF para entregarlo',
    'Your name, for the top of the page:':'Tu nombre, para la parte de arriba de la página:',
    'Block code':'Código de bloques',
    'Student:':'Estudiante:','Date:':'Fecha:','High score:':'Récord:',
    '(no name)':'(sin nombre)','(no blocks yet)':'(todavía no hay bloques)',
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
    const sp=SPEED;
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
      a.vars={};
      VM.sync(a); VM.setHome(a);
    });
    /* one variable, made ready: the scoreboard shows it */
    VM.project.vars.score=0;
  }

  /* ------------------------------------------------- nothing is kept
     Every page load starts from the starter — the Ground's code and
     nothing else (or, for a teacher at ?answer, the finished game). A
     student's code lasts until the page is refreshed, and ↺ puts the
     starter back before that. */
  function given(){
    const all = teacher ? answer() : starter();
    NAMES.forEach(n=>{ const a=actor(n); if(a) a.scripts=JSON.parse(JSON.stringify(all[n])); });
  }
  /* earlier versions kept a student's blocks in the browser; clear them */
  function forget(){
    OLD_SAVES.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });
  }
  function original(){
    if(!confirm(T('Throw away your code and start again?'))) return;
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
    return VM.project.actors.some(o=>o.name===CACTUS && o.visible!==false &&
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

  /* ============================================= the code, as a PDF
     WHAT A STUDENT HANDS IN: every object's blocks in ONE file — the
     Dino, the Cactus and the Ground, each under its own heading, written
     out as text, one block to a line and indented the way they nest,
     under their name, the date and their high score. It can be saved at
     any point, so a half-finished game can be handed in as it stands.

     THE PDF IS WRITTEN HERE, by hand, the way Asteroid Dodge does it. The
     folder runs with no network and no install, and a PDF library off a
     CDN would break that on the first lab machine without internet. Text
     in Courier is the simplest PDF there is: a few objects, a content
     stream per page, and a table of byte offsets at the end. Courier has
     no accents, so Spanish headings lose theirs (Código → Codigo). */
  const ASCII = str => String(str==null?'':str).normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/▶ */g,'').replace(/[−–—]/g,'-').replace(/×/g,'*').replace(/÷/g,'/')
    .replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/…/g,'...')
    .replace(/[^\x20-\x7e]/g,'?');
  function inline(bk){
    const bd=window.BLOCKS && BLOCKS.of(bk.op); if(!bd) return bk.op;
    return BLOCKS.parts(bd.label).map(seg=>{
      if(seg[0]!=='%') return seg;
      const k=seg[1], sp=bd.args[k]||{}, v=(bk.args||{})[k];
      if(v && typeof v==='object' && v.op){
        const kd=(BLOCKS.of(v.op)||{}).kind;
        return kd==='bool' ? '<'+inline(v)+'>' : '('+inline(v)+')';
      }
      if(sp.type==='bool') return '< >';
      if(sp.type==='num' || sp.type==='str') return '('+(v==null?'':v)+')';
      return '['+(v==null?'':v)+']';
    }).join('');
  }
  function lines(list, depth, out){
    const pad='    '.repeat(depth);
    (list||[]).forEach(bk=>{
      out.push(pad+inline(bk));
      const kd=(BLOCKS.of(bk.op)||{}).kind;
      if(kd==='c' || kd==='c2'){
        lines(bk.body, depth+1, out);
        if(kd==='c2'){ out.push(pad+'else'); lines(bk.body2, depth+1, out); }
        out.push(pad+'end');
      }
    });
    return out;
  }
  /* one object's scripts as lines of text, a blank line between scripts */
  function scriptText(name){
    const a=actor(name), out=[];
    (a && a.scripts || []).forEach((sc,i)=>{
      if(i) out.push('');
      if(sc.hat){ out.push(inline(sc.hat)); lines(sc.body, 1, out); }
      else lines(sc.body, 0, out);
    });
    return out.length ? out : [T('(no blocks yet)')];
  }
  /* pages of Courier, a bold line where asked */
  function pdf(rows){
    const W=612, H=792, M=54, LH=13, COLS=84, PER=Math.floor((H-2*M)/LH);
    const wrapped=[];
    rows.forEach(r=>{
      let t=ASCII(r.t), lead=(t.match(/^ */)||[''])[0]+'      ';
      if(!t.length){ wrapped.push({ t:'', b:r.b }); return; }
      while(t.length>COLS){ wrapped.push({ t:t.slice(0,COLS), b:r.b }); t=lead+t.slice(COLS); }
      wrapped.push({ t, b:r.b });
    });
    const pages=[];
    for(let i=0;i<wrapped.length;i+=PER) pages.push(wrapped.slice(i,i+PER));
    const esc=t=>t.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    const objs=[];                                   // index 0 is object 1
    objs[0]='<< /Type /Catalog /Pages 2 0 R >>';
    objs[2]='<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>';
    objs[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>';
    const kids=[];
    pages.forEach((pg,n)=>{
      const pageNo=6+n*2, streamNo=pageNo+1;   // 1-4 fonts and tree, 5 is Info
      let body='BT\n'+LH+' TL\n'+M+' '+(H-M)+' Td\n';
      pg.forEach(r=>{ body+=(r.b?'/F2':'/F1')+' 10 Tf\n('+esc(r.t)+') Tj T*\n'; });
      body+='/F1 8 Tf\nET\nBT /F1 8 Tf '+(W-M-60)+' '+(M/2)+' Td (page '+(n+1)+' of '+pages.length+') Tj ET\n';
      objs[pageNo-1]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+H+'] '+
        '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+streamNo+' 0 R >>';
      objs[streamNo-1]='<< /Length '+body.length+' >>\nstream\n'+body+'endstream';
      kids.push(pageNo+' 0 R');
    });
    objs[1]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+pages.length+' >>';
    objs[4]='<< /Producer (Dino Run) >>';
    let out='%PDF-1.4\n'; const at=[];
    objs.forEach((o,i)=>{ at[i]=out.length; out+=(i+1)+' 0 obj\n'+o+'\nendobj\n'; });
    const xref=out.length;
    out+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n'+
      at.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+
      'trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R /Info 5 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
    return out;
  }
  /* what goes on the page: a header, then each object in turn */
  function handIn(name){
    const labels=[T('Student:'), T('Date:'), T('High score:')];
    const w=Math.max(...labels.map(l=>l.length))+2;
    const rows=[
      { t:'DINO RUN - '+T('Block code'), b:true },
      { t:'' },
      { t:labels[0].padEnd(w)+(name||T('(no name)')) },
      { t:labels[1].padEnd(w)+new Date().toLocaleString(window.LANG==='es'?'es':'en') },
      { t:labels[2].padEnd(w)+pad5(hi) }
    ];
    NAMES.forEach(n=>{
      rows.push({ t:'' }, { t:'' }, { t:n.toUpperCase(), b:true }, { t:'' });
      scriptText(n).forEach(t=>rows.push({ t }));
    });
    return rows;
  }
  function download(){
    let name=''; try{ name=localStorage.getItem(NAME_KEY)||''; }catch(e){}
    const typed=prompt(T('Your name, for the top of the page:'), name);
    if(typed===null) return;                   // cancelled
    name=typed.trim();
    try{ localStorage.setItem(NAME_KEY, name); }catch(e){}
    const blob=new Blob([pdf(handIn(name))], { type:'application/pdf' });
    const a=document.createElement('a');
    const slug=(name||'student').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'student';
    a.href=URL.createObjectURL(blob);
    a.download='dino-run-'+slug+'.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
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
    const rst=$('#dnReset'); if(rst) rst.title=T('Start again from the beginning');
    set('#dnPdf', '⤓ '+T('DOWNLOAD SCRIPT'));
    const dl=$('#dnPdf'); if(dl) dl.title=T('Save the code of all three objects as one PDF, to hand in');
    const tb=$('#dnTeacher'); if(tb) tb.textContent=T('Teacher view — answer key loaded');
    brief(); message(); buttons();
  }
  const LANG_BTN = () => window.LANG==='es' ? '🌐 English' : '🌐 Español';
  function brief(){
    const el=$('#dnBrief .card'); if(!el) return;
    const steps=[
      '<b>Ground.</b> Already done: it slides left <code>forever</code> with <code>change x by -0.3</code>, and when <code>x position &lt; -32</code> it does <code>change x by 32</code> so it never runs out. Click it to read how.',
      '<b>Cactus.</b> Slide it left the same way. When <code>x position &lt; -20</code>, <code>set x to 20</code> so it comes back.',
      '<b>Dino.</b> <code>when space key pressed</code>: <code>glide</code> up to <code>y 6</code>, then <code>glide</code> back down to <code>y 0</code>.',
      '<b>Game over.</b> On the Cactus: <code>if touching Dino?</code> then <code>stop all</code>.',
      '<b>Score.</b> On the Ground: <code>change score by 0.2</code> inside the <code>forever</code>.'
    ];
    el.innerHTML=`
      <div class="dn-lang"><button class="dn-btn" id="dnLang2">${LANG_BTN()}</button></div>
      <h1>${T('DINO RUN')}</h1>
      <p class="kick">${T('BUILD THE GAME OUT OF BLOCKS')}</p>
      <p>${T('The <b>Ground</b> already slides along, so the Dino looks like it is running. The <b>Dino</b> and the <b>Cactus</b> have no code yet. Click one — or press <b>C</b> — and write its blocks. Then press <b>SPACE</b> to play.')}</p>
      <div class="dn-keys">
        <div><kbd>SPACE</kbd> <span>${T('play, then jump')}</span></div>
        <div><kbd>C</kbd> <span>${T('open the blocks')}</span></div>
      </div>
      <p class="kick">${T('WHAT TO BUILD')}</p>
      <ol>${steps.map(s=>`<li>${T(s)}</li>`).join('')}</ol>
      <p class="dn-note">${T('Your code is cleared when you refresh the page. <b>↺</b> clears it too.')}</p>
      <div class="row"><button class="btn good" id="dnGo">${T('Start coding ▶')}</button></div>`;
    $('#dnGo').onclick=()=>{ closeBrief(); if(window.CODER){ CODER.setActor(actor(DINO)); CODER.show(); } };
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
  const CODING ={ x0:-14.5, x1:12,  y0:-2,   y1:7 };
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
    if(teacher) $('#dnTeacher').classList.remove('hidden');
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
    $('#dnPdf').onclick=download;
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

  return { start, step, draw, starter, answer, given, setLang,
           scriptText, handIn, pdf, download,
           DINO, CACTUS, GROUND, CAST, PALETTE, SET,
           NUM:{ START_X, CACTUS_X, JUMP_Y, JUMP_T, SPEED, SCORE, SPAWN_X, GONE_X, TILE },
           get teacher(){ return teacher; },
           get active(){ return on; },
           get over(){ return over; },
           get hi(){ return hi; },
           crashed };
})();
