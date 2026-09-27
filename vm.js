/* =====================================================================
   VM — the interpreter, and the 3D stage it acts on.

   This is a small language, not a machine simulator. Scripts belong to
   objects, objects live in the world, and the code is the thing the
   student is actually making.

   HOW IT RUNS. Every script is a JavaScript generator. A loop yields
   once per pass and `wait` yields a duration, so the scheduler can hold
   dozens of scripts in flight at once and none of them can lock the
   frame — `forever` is safe to write, which is the whole reason Scratch
   feels the way it does.

   WHAT MAKES IT ADVANCED. Variables with real scope (a call's parameters
   beat an object's own, which beat the project's), lists, custom blocks
   that take arguments and can recurse, clones that each run their own
   copy of the script, and broadcasts that other objects answer.
   ===================================================================== */
window.VM = (function(){
  /* Which project is loaded. The sandbox has one; every mission has its own,
     so walking into Mission 1 cannot flatten the thing somebody spent an hour
     building, and leaving it again gives that thing straight back. */
  const SANDBOX='dq_code_project';
  let KEY=SANDBOX;
  const MAXTHREADS=400;

  let P = blank();
  let group=null, threads=[], running=false, t0=0, uid=1;

  function blank(){
    /* `stage` is how the project wants to be LOOKED at, not a different
       engine. 'world' is the room you walk around inside; 'flat' parks an
       overhead camera on the floor plane and hands the keys to the game
       instead of to your legs.

       It works out to a camera and nothing else because the motion blocks
       were already right for it: move/turn/point all act on x and z with
       `dir` as a compass heading, which IS a top-down 2D stage. y is the
       height off the floor, and a flat game simply never touches it. */
    return { actors:[], vars:{}, lists:{}, procs:[], msgs:['message1'], stage:'world' };
  }
  /* VISITING. Somebody else's game, opened out of the arcade, running in
     this browser and belonging to another child. Nothing about it is
     written down: save() goes quiet, so a clone spawned by their code, an
     object their program moved, and the variables it set all vanish when
     you walk out, and the project you get back is the one they published. */
  let visiting=false;
  function adopt(proj, stage){
    quiet++; reset(); quiet--;
    visiting=true;
    const raw = proj || {};
    Object.assign(P.vars, raw.vars||{});
    Object.assign(P.lists, raw.lists||{});
    (raw.procs||[]).forEach(x=>P.procs.push(x));
    if(raw.msgs && raw.msgs.length){ P.msgs.length=0; raw.msgs.forEach(m=>P.msgs.push(m)); }
    P.stage = stage || raw.stage || 'world';
    uid = raw.uid || 1;
    /* Deep-copied on the way in. The object handed over came from JSON the
       page fetched, and the VM mutates actors as it runs — without this,
       leaving and re-entering a game would start it half-played. */
    (raw.actors||[]).forEach(a=>{
      const c=JSON.parse(JSON.stringify(a));
      c.mesh=null; c.bubble=null; c.isClone=false;
      if(!c.home) c.home=snapshot(c);
      freshenActor(c);
      P.actors.push(c);
    });
  }
  const isFlat = () => P.stage==='flat';
  /* ADOPT, BUT AS YOUR OWN. Editing a game out of the arcade is the same
     load as playing one and the opposite intent: it goes into the slot you
     are working in, saving comes back on, and from there it is a project
     like any other. Used for "edit mine"; adopt() stays the one for
     "somebody else's, do not touch". */
  function install(proj, stage){
    adopt(proj, stage);
    visiting=false;
    save();
  }

  /* ------------------------------------------------------------ actors */
  function geo(shape,size){
    const r=Math.max(0.1,size);
    if(shape==='ball')     return new THREE.SphereGeometry(0.5*r,18,12);
    if(shape==='cylinder') return new THREE.CylinderGeometry(0.4*r,0.4*r,r,18);
    if(shape==='cone')     return new THREE.ConeGeometry(0.5*r,r,18);
    return new THREE.BoxGeometry(r,r,r);
  }
  /* An object is either a primitive, built here and now, or a costume out
     of the kits, which has to be fetched. A costume's object goes into the
     world immediately as an empty group at the right spot — so the program
     can move it, and the picker can select it, before the model lands —
     and the model is added underneath when it arrives. */
  function build(a){
    if(a.mesh && a.mesh.parent) a.mesh.parent.remove(a.mesh);
    const dressed = window.COSTUMES && COSTUMES.isModel(a.shape);
    const m = dressed ? new THREE.Group()
      : new THREE.Mesh(geo(a.shape,a.size),
          new THREE.MeshLambertMaterial({color:new THREE.Color(a.colour)}));
    m.userData.actor=a; m.userData.owner=m;
    a.mesh=m; if(group) group.add(m);
    if(a.bubble){ m.add(a.bubble); }
    aim(a,m);
    sync(a);
    if(dressed){
      const want=a.shape;
      COSTUMES.load(want).then(o=>{
        if(a.mesh!==m || a.shape!==want) return;      // rebuilt while we waited
        o.scale.multiplyScalar(Math.max(0.1,a.size));
        m.add(o);
      }).catch(()=>{
        // a costume that will not load leaves a cube behind, not an
        // invisible object the student cannot find or click
        if(a.mesh!==m || a.shape!==want) return;
        m.add(new THREE.Mesh(geo('cube',a.size),
          new THREE.MeshLambertMaterial({color:new THREE.Color(a.colour)})));
      });
    }
  }
  /* Something for the crosshair to land on. A costume arrives late and is a
     tree of meshes rather than one, so every object carries an invisible box
     the size of itself: look at an object and the game knows which it is,
     model or cube, loaded or still on its way. */
  function aim(a, m){
    forget(a);
    const r=Math.max(0.6,(a.size||1))*1.15;
    const box=new THREE.Mesh(new THREE.BoxGeometry(r,r,r),
      new THREE.MeshBasicMaterial({ transparent:true, opacity:0, depthWrite:false }));
    box.userData.actor=a; box.userData.owner=box;
    m.add(box); a.aim=box;
    if(typeof G!=='undefined' && G.hits) G.hits.push(box);
  }
  function forget(a){
    if(!a || !a.aim) return;
    if(typeof G!=='undefined' && G.hits) G.hits=G.hits.filter(h=>h!==a.aim);
    if(a.aim.parent) a.aim.parent.remove(a.aim);
    /* every clone gets its own box, so every deleted clone gives its box
       back — a runner that spawns a cactus a second otherwise piles up
       geometry nobody will ever draw again */
    if(a.aim.geometry) a.aim.geometry.dispose();
    a.aim=null;
  }
  function sync(a){
    if(!a.mesh) return;
    a.mesh.position.set(a.x,a.y,a.z);
    /* THREE ANGLES, ABOUT THE LANGUAGE'S OWN AXES, not the renderer's.
       `dir` spins about up (the language's z, three's y) and `tilt` tips
       about across (x either way), and both of those already lined up.
       `roll` is about the language's y — into the screen — which is
       three's z pointing the OTHER WAY, so the sign flips here and
       nowhere else. Without that, `turn y by 15` and `change y by 1`
       would disagree about which way y points, in the same room, in front
       of somebody being taught the axes. */
    a.mesh.rotation.set(a.tilt*Math.PI/180, a.dir*Math.PI/180, -(a.roll||0)*Math.PI/180);
    a.mesh.visible=!!a.visible;
  }
  /* A read-only copy of somebody else's object, for this room to look at. It
     is built exactly the way ours are, but it carries no actor and runs no
     code: the machine that owns an object is the one running its scripts. */
  function ghostMesh(spec){
    const shape=String((spec&&spec.shape)||'cube');
    const size=Math.max(0.1, +(spec&&spec.size) || 1);
    const colour=(spec&&spec.colour)||'#8fd3ff';
    const plain=()=>new THREE.Mesh(geo(shape==='cube'?'cube':shape,size),
      new THREE.MeshLambertMaterial({color:new THREE.Color(colour)}));
    if(window.COSTUMES && COSTUMES.isModel(shape)){
      const g=new THREE.Group();
      COSTUMES.load(shape)
        .then(o=>{ o.scale.multiplyScalar(size); g.add(o); })
        .catch(()=>{ g.add(new THREE.Mesh(geo('cube',size),
          new THREE.MeshLambertMaterial({color:new THREE.Color(colour)}))); });
      return g;
    }
    return plain();
  }

  /* HOME is everything a running program can change about an object. It is
     snapshotted the moment the object is made, so "put it back" is a plain
     copy rather than a re-run of whatever moved it. */
  const HOME=['x','y','z','dir','tilt','roll','size','shape','colour','visible'];
  const snapshot = a => { const o={}; HOME.forEach(k=>o[k]=a[k]); return o; };
  function addActor(o){
    const a=Object.assign({
      id:uid++, name:'object'+uid, shape:'cube', colour:'#8fd3ff',
      x:0,y:1,z:0, dir:0, tilt:0, roll:0, size:1, visible:true,
      scripts:[], vars:{}, isClone:false, mesh:null, bubble:null, saying:''
    }, o||{});
    if(!a.home) a.home=snapshot(a);
    P.actors.push(a); build(a); save();
    return a;
  }
  function delActor(a){
    forget(a);
    threads=threads.filter(t=>t.actor!==a);
    if(a.mesh && a.mesh.parent) a.mesh.parent.remove(a.mesh);
    P.actors=P.actors.filter(x=>x!==a);
    save();
  }
  /* Put one object back to how it was made: where it stood, which way it
     faced, its shape, size and colour. Its own scripts stop and the copies
     it left behind go with them, because a half-reset room is worse than
     none. Takes effect at once — there is nothing to run. */
  function resetActor(a){
    if(!a) return;
    P.actors.filter(c=>c!==a && c.isClone && c.name===a.name).slice().forEach(delActor);
    threads=threads.filter(t=>t.actor!==a);
    bubble(a,'');
    Object.assign(a, a.home || snapshot(a));
    build(a); save();
  }
  /* Put a costume on by hand. It becomes the object's home look too — the
     student has just said this is what the thing IS, so a reset that
     undressed it again would be wrong. */
  function dress(a,costume){
    if(!a) return;
    a.shape=String(costume);
    if(a.home) a.home.shape=a.shape;
    build(a); save();
  }
  /* THIS IS WHERE THIS OBJECT LIVES NOW — the same promise dress() makes
     about a costume, made about the whole of it.

     A room that stands an object up itself has to say so. addActor takes
     the home snapshot as the object is made, so anything set on the line
     AFTER it — a robot's real height, the mark on the floor it starts on —
     is not in the snapshot, and ↺ puts back the one-unit cube the object
     was for the instant before the room dressed it. */
  function setHome(a){
    if(!a) return;
    a.home=snapshot(a); save();
  }
  const actorByName = nm => P.actors.find(a=>a.name===nm) || null;

  /* say-bubbles are canvas sprites so the text can be anything */
  function bubble(a,text){
    if(a.bubble && a.bubble.parent) a.bubble.parent.remove(a.bubble);
    a.bubble=null; a.saying=text||'';
    if(!text) return;
    const c=document.createElement('canvas'); c.width=256; c.height=64;
    const x=c.getContext('2d');
    x.fillStyle='rgba(255,255,255,.94)';
    x.beginPath(); x.roundRect(2,2,252,60,14); x.fill();
    x.fillStyle='#241d38'; x.font='bold 24px '+uiFont(); x.textAlign='center';
    x.fillText(String(text).slice(0,20),128,42);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));
    sp.scale.set(3,0.75,1); sp.position.y=1.4;
    a.bubble=sp; if(a.mesh) a.mesh.add(sp);
  }

  /* ------------------------------------------------------------- scope
     A name is looked up in the call's parameters first, then the object's
     own variables, then the project's. That ordering is what lets a custom
     block take an argument called `n` without trampling a global `n`. */
  function lookup(ctx,name){
    if(ctx.locals && name in ctx.locals) return ctx.locals[name];
    if(ctx.actor && name in ctx.actor.vars) return ctx.actor.vars[name];
    if(name in P.vars) return P.vars[name];
    return 0;
  }
  function assign(ctx,name,v){
    if(ctx.locals && name in ctx.locals){ ctx.locals[name]=v; return; }
    if(ctx.actor && name in ctx.actor.vars){ ctx.actor.vars[name]=v; return; }
    P.vars[name]=v;
  }
  const num = v => { const x=parseFloat(v); return isFinite(x)?x:0; };
  const truthy = v => v===true || (typeof v==='string' ? v!=='' && v!=='false' : num(v)!==0);

  /* -------------------------------------------------------- expressions */
  function val(a,ctx){
    if(a && typeof a==='object' && a.op) return evalBlock(a,ctx);
    return a;
  }
  function evalBlock(bk,ctx){
    const A=bk.args||{}, g=k=>val(A[k],ctx);
    switch(bk.op){
      case 'op.add': return num(g('a'))+num(g('b'));
      case 'op.sub': return num(g('a'))-num(g('b'));
      case 'op.mul': return num(g('a'))*num(g('b'));
      case 'op.div': { const d=num(g('b')); return d===0?0:num(g('a'))/d; }
      case 'op.mod': { const d=num(g('b')); return d===0?0:num(g('a'))%d; }
      case 'op.round': return Math.round(num(g('a')));
      case 'op.math': {
        const v=num(g('a')), f=g('f');
        return f==='abs'?Math.abs(v) : f==='sqrt'?Math.sqrt(Math.max(0,v))
             : f==='sin'?Math.sin(v*Math.PI/180) : f==='cos'?Math.cos(v*Math.PI/180)
             : f==='floor'?Math.floor(v) : Math.ceil(v);
      }
      case 'op.random': { const a=num(g('a')), b=num(g('b'));
        const lo=Math.min(a,b), hi=Math.max(a,b);
        return (Number.isInteger(a)&&Number.isInteger(b))
          ? lo+Math.floor(Math.random()*(hi-lo+1)) : lo+Math.random()*(hi-lo); }
      case 'op.lt': return num(g('a')) <  num(g('b'));
      case 'op.gt': return num(g('a')) >  num(g('b'));
      case 'op.eq': return String(g('a')).toLowerCase() === String(g('b')).toLowerCase();
      case 'op.and': return truthy(g('c')) && truthy(g('d'));
      case 'op.or':  return truthy(g('c')) || truthy(g('d'));
      case 'op.not': return !truthy(g('c'));
      case 'op.join': return String(g('a'))+String(g('b'));

      case 'data.get': return lookup(ctx, A.v);
      case 'list.item': { const L=P.lists[A.l]||[]; const i=Math.round(num(g('n')));
                          return (i>=1 && i<=L.length) ? L[i-1] : ''; }
      case 'list.len': return (P.lists[A.l]||[]).length;

      case 'motion.pos': return +(ctx.actor?coord(ctx.actor, g('a')):0).toFixed(3);
      case 'motion.dir': return ctx.actor?ctx.actor.dir:0;
      case 'sense.dist': { const o=target(g('o'),ctx); if(!o||!ctx.actor) return 0;
        return +Math.hypot(o.x-ctx.actor.x,o.y-ctx.actor.y,o.z-ctx.actor.z).toFixed(2); }
      case 'sense.touch': {
        if(EDGES.includes(g('o'))) return atEdge(ctx.actor, g('o'));
        /* TOUCHING A NAME MEANS TOUCHING ANY OF THEM, clones included, the
           way Scratch reads it — `touching Asteroid?` has to see every rock
           the spawner made, not only the hidden one they were copied from.
           A hidden object is not there to touch. */
        const me=ctx.actor; if(!me) return false;
        /* TWO DRAWINGS TOUCH WHERE THEIR PIXELS DO. A costume that is a
           picture rather than a shape can answer for itself — costumes.js
           lays the two masks over each other, the way Scratch does — and
           says null for anything it did not draw, which falls back to the
           sphere every other object has always used. */
        const near=o=>{
          if(!o || o===me) return false;
          const drawn=window.COSTUMES && COSTUMES.touching ? COSTUMES.touching(me,o) : null;
          if(drawn!==null && drawn!==undefined) return drawn;
          return Math.hypot(o.x-me.x,o.y-me.y,o.z-me.z) < (me.size+(o.size||1))*0.6;
        };
        const nm=g('o');
        if(nm==='player' || nm==='myself') return near(target(nm,ctx));
        return P.actors.some(o=>o.name===nm && o.visible!==false && near(o)); }
      case 'sense.key': return keyDown(keyCode(g('k')));
      case 'sense.posOf': { const o=target(g('o'),ctx); return o?+coord(o, g('a')).toFixed(3):0; }
      case 'sense.timer': return +((performance.now()-t0)/1000).toFixed(2);
      case 'sense.count': { const w=g('o');
        if(w==='clones') return P.actors.filter(a=>a.isClone).length;
        return P.actors.filter(a=>a.name===w).length; }
      default: return 0;
    }
  }
  /* ------------------------------------------------------- the axes
     THE STUDENT'S AXES ARE NOT THE ENGINE'S, and this one line is the
     whole of the difference.

     On screen x runs across, and the other two are "up" and "into the
     picture". The language names the two you can point at first — x
     across, y into the screen — and leaves z for height, so that the
     pair a student reaches for in a side-on room is x and y. Three.js is
     Y-up and always will be, so the actor's own fields stay engine-
     native and the swap happens HERE, where a block hands over the name
     it was given. Nothing downstream — sync, the camera, the costumes,
     the floor — knows anything about it.

     Every block that takes an axis BY NAME goes through ax(). Blocks
     that work in the ground plane — move, point towards, distance to —
     do not, because they never name an axis: they are arithmetic on the
     floor, and the floor is the floor whatever its two directions are
     called. */
  const FIELD = { x:'x', y:'z', z:'y' };      // the fallback, if blocks.js is late
  const SIGN  = { x:1, y:-1, z:1 };
  const ax = k => (window.BLOCKS && BLOCKS.axisField) ? BLOCKS.axisField(k)
                : (FIELD[String(k==null?'':k).trim().toLowerCase()] || 'x');
  const sgn = k => (window.BLOCKS && BLOCKS.axisSign) ? BLOCKS.axisSign(k)
                : (SIGN[String(k==null?'':k).trim().toLowerCase()] || 1);
  /* ONE COORDINATE, BOTH WAYS. The sign has to be applied to reading as
     well as writing or `y position` reports the negative of where the
     robot is — and a student comparing it against the number they just
     moved by would be told they had gone the wrong way. */
  const coord = (a, k) => sgn(k) * (+a[ax(k)] || 0);
  const place = (a, k, v) => { a[ax(k)] = sgn(k) * v; };

  /* WHICH KEY A KEY SLOT MEANS. The table lives in blocks.js with the rest
     of the language, so the menu the editor offers and the codes the VM
     asks the browser about cannot drift apart. An unknown name gets an
     empty code, and an empty code is a key nobody is pressing. */
  function keyCode(k){
    if(window.BLOCKS && BLOCKS.keyCode) return BLOCKS.keyCode(k);
    k=String(k||'').toLowerCase();
    if(k==='space') return 'Space';
    if(k==='up') return 'ArrowUp'; if(k==='down') return 'ArrowDown';
    if(k==='left') return 'ArrowLeft'; if(k==='right') return 'ArrowRight';
    return /^[0-9]$/.test(k) ? 'Digit'+k : 'Key'+k.toUpperCase().slice(0,1);
  }
  /* 'any' is a key the keyboard does not have, so it is answered here */
  const anyKey = () => Object.keys(G.keys).some(c=>G.keys[c]);
  const keyDown = code => code==='any' ? anyKey() : (!!code && !!G.keys[code]);
  /* The room's four walls. An object touches the edge once its own skin
     reaches one — and it STAYS touching if it has already gone past, so a
     fast mover cannot step over the test in one go and escape the room. */
  /* ONE WALL AT A TIME, too: `up edge` is the wall at the top of the
     screen, and so on round. Named in the language's axes — up is +y,
     which is the engine's −z — so they mean what they say from the flat
     stage camera. Plain `edge` is still any of the four. */
  const EDGES = ['edge','up edge','down edge','left edge','right edge'];
  function atEdge(a, side){
    if(!a) return false;
    const L=(window.LEVELS||{})[G.room] || { w:70, d:70 };
    const r=(a.size||1)*0.5;                    // walls are 1 thick, centred on w/2
    const X=L.w/2-0.5-r, Y=L.d/2-0.5-r, y=-a.z;
    switch(side){
      case 'up edge':    return y   >=  Y;
      case 'down edge':  return y   <= -Y;
      case 'left edge':  return a.x <= -X;
      case 'right edge': return a.x >=  X;
    }
    return Math.abs(a.x) >= X || Math.abs(a.z) >= Y;
  }
  /* `player` is the person standing in the world; anything else is an object */
  function target(nameOrObj,ctx){
    if(nameOrObj==='player') return { x:G.pos.x, y:G.pos.y-1.7, z:G.pos.z, size:1 };
    if(nameOrObj==='myself') return ctx.actor;
    return actorByName(nameOrObj);
  }

  /* --------------------------------------------------------- statements */
  function* run(list,ctx){
    for(const bk of (list||[])){
      const r = yield* exec(bk,ctx);
      if(r==='stopAll' || r==='stopScript' || r==='killed') return r;
    }
  }
  function* exec(bk,ctx){
    const A=bk.args||{}, g=k=>val(A[k],ctx), a=ctx.actor;
    switch(bk.op){
      /* --- control ------------------------------------------------- */
      case 'ctrl.wait': { yield { wait: Math.max(0,num(g('n'))) }; break; }
      case 'ctrl.repeat': {
        const n=Math.max(0,Math.round(num(g('n'))));
        for(let i=0;i<n;i++){
          const r=yield* run(bk.body,ctx); if(r) return r;
          yield 'tick';
        }
        break;
      }
      case 'ctrl.forever': {
        while(true){
          const r=yield* run(bk.body,ctx); if(r) return r;
          yield 'tick';
        }
      }
      case 'ctrl.repeatUntil': {
        let guard=0;
        while(!truthy(g('c'))){
          const r=yield* run(bk.body,ctx); if(r) return r;
          yield 'tick';
          if(++guard>100000) break;
        }
        break;
      }
      case 'ctrl.waitUntil': {
        while(!truthy(g('c'))) yield 'tick';
        break;
      }
      case 'ctrl.if': { if(truthy(g('c'))){ const r=yield* run(bk.body,ctx); if(r) return r; } break; }
      case 'ctrl.ifelse': {
        const r = truthy(g('c')) ? yield* run(bk.body,ctx) : yield* run(bk.body2,ctx);
        if(r) return r; break;
      }
      case 'ctrl.stop': return g('w')==='all' ? 'stopAll' : 'stopScript';
      case 'ctrl.clone': {
        if(a && P.actors.length<MAXTHREADS){
          const c=addActor({ name:a.name, shape:a.shape, colour:a.colour,
            x:a.x,y:a.y,z:a.z, dir:a.dir, tilt:a.tilt, roll:a.roll, size:a.size,
            visible:a.visible, scripts:a.scripts, vars:Object.assign({},a.vars), isClone:true });
          startHats('event.clone', null, c);
        }
        break;
      }
      case 'ctrl.delclone': { if(a && a.isClone){ delActor(a); return 'killed'; } break; }

      /* --- events -------------------------------------------------- */
      case 'event.send': { startHats('event.recv', A.m); break; }
      case 'event.sendWait': {
        const made=startHats('event.recv', A.m);
        while(made.some(t=>threads.includes(t))) yield 'tick';
        break;
      }

      /* --- motion -------------------------------------------------- */
      case 'motion.move': {
        if(a){ const d=num(g('n')), r=a.dir*Math.PI/180;
               a.x += Math.sin(r)*d*0.1; a.z += Math.cos(r)*d*0.1; sync(a); }
        break;
      }
      /* WHICH ANGLE AN AXIS TURNS. The axis letters are the language's,
         so this is the one place that has to know that spinning about
         `up` is the thing `dir` has always meant. A turn with no axis on
         it is a turn saved before this block grew one, and it meant the
         everyday left-and-right: z. */
      case 'motion.turn': {
        if(a){
          const k=({ x:'tilt', y:'roll', z:'dir' })[g('a')] || 'dir';
          a[k]=((a[k]||0)+num(g('n')))%360; sync(a);
        }
        break;
      }
      /* The old `tilt %n` block, kept running and off the palette: a
         project saved before it became `turn x by` is somebody's work,
         and it should not stop working because the block it was built
         from got better. Nothing offers it any more. */
      case 'motion.tilt': { if(a){ a.tilt=(a.tilt+num(g('n')))%360; sync(a);} break; }
      /* A FACING, NOT A SPIN. Set rather than added, and the same number
         `direction` reports and `point towards` writes — three blocks
         that would be useless to each other if they disagreed. */
      case 'motion.face': { if(a){ a.dir=num(g('n'))%360; sync(a);} break; }
      case 'motion.goto': { if(a){ place(a,'x',num(g('x'))); place(a,'y',num(g('y')));
                                   place(a,'z',num(g('z'))); sync(a);} break; }
      case 'motion.changeBy': { if(a){ const k=g('a');
                                       place(a, k, coord(a,k)+num(g('n'))); sync(a);} break; }
      case 'motion.setTo': { if(a){ place(a, g('a'), num(g('n'))); sync(a);} break; }
      case 'motion.point': {
        const o=target(g('o'),ctx);
        if(a&&o){ a.dir = Math.atan2(o.x-a.x, o.z-a.z)*180/Math.PI; sync(a); }
        break;
      }
      case 'motion.glide': {
        if(!a) break;
        const secs=Math.max(0.01,num(g('t')));
        /* Worked entirely in the STUDENT's coordinates and written back
           through place(), so the glide and `go to` cannot disagree
           about which way y runs. */
        const sx=coord(a,'x'), sy=coord(a,'y'), sz=coord(a,'z');
        const tx=num(g('x')), ty=num(g('y')), tz=num(g('z'));
        const start=performance.now();
        while(true){
          const k=Math.min(1,(performance.now()-start)/(secs*1000));
          place(a,'x',sx+(tx-sx)*k); place(a,'y',sy+(ty-sy)*k);
          place(a,'z',sz+(tz-sz)*k); sync(a);
          if(k>=1) break;
          yield 'tick';
        }
        break;
      }

      /* --- looks --------------------------------------------------- */
      case 'looks.say': { if(a) bubble(a, g('s')); break; }
      case 'looks.sayFor': {
        if(a){ bubble(a,g('s')); yield { wait: Math.max(0,num(g('n'))) }; bubble(a,''); }
        break;
      }
      case 'looks.colour': { if(a){ a.colour=String(g('s'));
        // a costume carries the kit's own texture; only a primitive takes a colour
        if(a.mesh && a.mesh.material) a.mesh.material.color.set(a.colour);} break; }
      case 'looks.size': { if(a){ a.size=Math.max(0.1,num(g('n'))); build(a);} break; }
      case 'looks.changeSize': { if(a){ a.size=Math.max(0.1,a.size+num(g('n'))); build(a);} break; }
      case 'looks.show': { if(a){ a.visible=true; sync(a);} break; }
      case 'looks.hide': { if(a){ a.visible=false; sync(a);} break; }
      /* BECOMING WHAT YOU ALREADY ARE CHANGES NOTHING, and costs nothing:
         `if key down pressed then become [ducking] else become [dino]`
         inside a forever asks sixty times a second, and rebuilding the
         object every time was sixty new meshes a second for no change. */
      case 'looks.shape': { if(a){ const s=String(g('s'));
        if(s!==a.shape || !a.mesh){ a.shape=s; build(a); } } break; }

      /* --- sensing ------------------------------------------------- */
      case 'sense.resetTimer': t0=performance.now(); break;

      /* --- data ---------------------------------------------------- */
      case 'data.set': { assign(ctx, A.v, g('n')); break; }
      case 'data.change': { assign(ctx, A.v, num(lookup(ctx,A.v))+num(g('n'))); break; }
      case 'list.add': { (P.lists[A.l]=P.lists[A.l]||[]).push(g('n')); break; }
      case 'list.del': { const L=P.lists[A.l]||[]; const i=Math.round(num(g('n')));
                         if(i>=1&&i<=L.length) L.splice(i-1,1); break; }
      case 'list.clear': { P.lists[A.l]=[]; break; }

      /* --- my blocks ----------------------------------------------- */
      case 'my.call': {
        const proc=P.procs.find(p=>p.name===A.p);
        if(proc){
          if((ctx.depth||0) > 40) break;                 // recursion has a floor
          const locals={};
          (proc.params||[]).forEach(pm=>{ locals[pm]= val((A.vals||{})[pm], ctx); });
          const r = yield* run(proc.body, { actor:ctx.actor, locals, depth:(ctx.depth||0)+1 });
          if(r==='stopAll') return r;
        }
        break;
      }
      default: break;
    }
  }

  /* One block, run on its own, the way clicking a block in Scratch's palette
     tries it out. A reporter is answered rather than run — the value comes
     straight back for the editor to show. Anything else joins the scheduler,
     which is why this also switches the VM on: trying a block out is running
     the project, just a very small piece of it. */
  function runBlock(bk, actor){
    if(!bk || !actor) return null;
    const bd = window.BLOCKS && BLOCKS.of(bk.op);
    const ctx = { actor, locals:null, depth:0 };
    if(bd && (bd.kind==='report' || bd.kind==='bool')){
      try{ return { value: val(bk,ctx) }; }
      catch(e){ return { value:'' }; }
    }
    if(threads.length>=MAXTHREADS) return null;
    running=true;
    threads.push({ actor, script:null, gen:run([bk],ctx), wait:0 });
    return { started:true };
  }

  /* -------------------------------------------------------- scheduling */
  function startScript(actor, script){
    if(threads.length>=MAXTHREADS) return null;
    const ctx={ actor, locals:null, depth:0 };
    const th={ actor, script, gen:run(script.body,ctx), wait:0 };
    threads.push(th);
    return th;
  }
  function startHats(hatOp, msg, onlyActor){
    const made=[];
    P.actors.forEach(a=>{
      if(onlyActor && a!==onlyActor) return;
      (a.scripts||[]).forEach(sc=>{
        if(!sc.hat || sc.hat.op!==hatOp) return;
        if(msg!=null && (sc.hat.args||{}).m !== msg) return;
        threads=threads.filter(t=>!(t.actor===a && t.script===sc));   // restart, Scratch-style
        const th=startScript(a,sc); if(th) made.push(th);
      });
    });
    return made;
  }
  /* WHICH RUN THIS IS. Pressing Run while something is already running
     is a RESTART — the threads are thrown away and begun again — but
     `running` was true before and is true after, so anything watching
     that flag for the start of an attempt never sees one. A counter that
     only goes up is the honest signal, and the ring's stages are judged
     one run at a time. */
  let runId=0;
  function greenFlag(){
    runId++;
    threads=[]; t0=performance.now(); running=true;
    P.actors.filter(a=>a.isClone).slice().forEach(delActor);   // clones do not survive a restart
    startHats('event.flag');
  }
  function stopAll(){ runId++; running=false; threads=[]; P.actors.forEach(a=>bubble(a,'')); }

  let keyWas={};
  function step(dt){
    if(!group) return;
    if(running){
      // key hats fire on the press, not every frame it is held
      P.actors.forEach(a=>(a.scripts||[]).forEach(sc=>{
        if(!sc.hat || sc.hat.op!=='event.key') return;
        const code=keyCode((sc.hat.args||{}).k);
        const down=keyDown(code);
        if(down && !keyWas[code+sc.id]) startScript(a,sc);
        keyWas[code+sc.id]=down;
      }));
      advance(dt);
    }
  }
  function advance(dt){
    /* Iterate a snapshot and remove only what finished. Rebuilding the list
       from the survivors would silently drop every thread STARTED during the
       pass — which is exactly what a clone or a broadcast does, so neither
       used to run. */
    const snapshot = threads.slice();
    const dead = new Set();
    for(const th of snapshot){
      if(th.wait>0){ th.wait-=dt; continue; }
      let guard=0;
      while(true){
        let r;
        try{ r=th.gen.next(); }
        catch(e){ console.warn('script error',e); dead.add(th); break; }
        if(r.done){
          dead.add(th);
          if(r.value==='stopAll'){ threads=[]; running=false; return; }
          break;
        }
        const y=r.value;
        if(y && typeof y==='object' && 'wait' in y){ th.wait=y.wait; break; }
        if(y==='tick') break;
        if(++guard>2000) break;              // a runaway block still yields the frame
      }
    }
    if(dead.size) threads = threads.filter(t=>!dead.has(t));
  }

  /* -------------------------------------------------------- persistence */
  /* load() switches KEY and then empties the old project, and emptying it
     deletes actors one at a time — each of which used to save. That wrote the
     OUTGOING project, shrinking, over the INCOMING project's slot: walk out of
     a mission and the sandbox you had built was overwritten by a mission ball.
     Nothing saves while a swap is in progress. */
  let quiet=0;
  /* THE PROJECT AS PLAIN DATA, and the only thing that knows how.

     An actor in memory carries its THREE.js mesh, and a mesh points back
     at the actor through userData — so the live project cannot be handed
     to JSON.stringify at all. It used to only matter to save(), which
     built the clean copy inline; publishing to the arcade is a second
     caller that needs exactly the same copy, and two places deciding what
     a project consists of is one place too many. Clones are left out
     because they are something the program made, not something the author
     did. */
  function plain(){
    return {
      actors:P.actors.filter(a=>!a.isClone).map(a=>({
        id:a.id, name:a.name, shape:a.shape, colour:a.colour,
        x:a.x, y:a.y, z:a.z, dir:a.dir, tilt:a.tilt, roll:a.roll, size:a.size, visible:a.visible,
        scripts:a.scripts, vars:a.vars, isClone:false, home:a.home })),
      vars:P.vars, lists:P.lists, procs:P.procs, msgs:P.msgs, uid, stage:P.stage
    };
  }
  let scratch=false;
  function save(){
    if(quiet || visiting || scratch) return;   // a visitor never writes on the
                                               // author, and scratch keeps nothing
    try{ localStorage.setItem(KEY, JSON.stringify(plain())); }catch(e){}
  }
  /* ------------------------------------------------- blocks that moved on
     A PROJECT IS SOMEBODY'S WORK AND IT DOES NOT ROT. `tilt %n` became
     `turn x by %n` — the same rotation, said properly — and a script
     saved with the old block would otherwise open with a hole in it where
     the editor could not find a block by that name. So it is rewritten on
     the way in. The VM still executes the old op as well, because a
     project can also arrive from the arcade without passing through here.

     Anything added to this list is a one-way rename: it runs over every
     script in every project that opens, so it has to be cheap and it has
     to be safe to run twice. */
  const MOVED = { 'motion.tilt': bk => ({ op:'motion.turn', args:{ a:'x', n:bk.args?bk.args.n:15 } }) };
  function freshen(list){
    (list||[]).forEach(bk=>{
      if(!bk || typeof bk!=='object') return;
      const moved=MOVED[bk.op];
      if(moved){ const to=moved(bk); bk.op=to.op; bk.args=Object.assign({}, bk.args, to.args); }
      Object.keys(bk.args||{}).forEach(k=>{
        const v=bk.args[k];
        if(v && typeof v==='object' && v.op) freshen([v]);
      });
      freshen(bk.body); freshen(bk.body2);
    });
  }
  const freshenActor = a => (a.scripts||[]).forEach(sc=>{
    if(sc.hat) freshen([sc.hat]);
    freshen(sc.body);
  });

  function load(){
    let raw=null;
    /* A scratch project opens empty every single time. Reading the slot
       would be the one thing it exists not to do. */
    if(scratch){ quiet++; reset(); quiet--; return; }
    try{ raw=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){}
    quiet++; reset(); quiet--;
    if(raw && Array.isArray(raw.actors)){
      Object.assign(P.vars, raw.vars||{});
      Object.assign(P.lists, raw.lists||{});
      (raw.procs||[]).forEach(x=>P.procs.push(x));
      if(raw.msgs&&raw.msgs.length){ P.msgs.length=0; raw.msgs.forEach(m=>P.msgs.push(m)); }
      uid=raw.uid||1;
      P.stage = raw.stage==='flat' ? 'flat' : 'world';
      raw.actors.forEach(a=>{ a.mesh=null; a.bubble=null;
        if(!a.home) a.home=snapshot(a);   // saved before objects remembered a home
        freshenActor(a);
        P.actors.push(a); });
    }
  }

  /* ------------------------------------------------------------- mount */
  /* Which project the NEXT enter() will open. Set before the room is built,
     because the room is what calls enter(). */
  function useSlot(slot){ KEY = slot || SANDBOX; visiting=false; scratch=false; }
  /* ------------------------------------------------------------ scratch
     A PROJECT THAT IS NOT KEPT. Nothing is read when it opens and nothing
     is written while it runs, so every entry is the same empty room — no
     half-finished script from last lesson, no blocks somebody else left
     on the floor, and no way for a walkthrough to be talking about a
     program that is already written.

     This is not `quiet`, which suspends saving for a moment and then puts
     it back, and not `visiting`, which protects somebody ELSE's project
     from being overwritten by yours. It says this project was never meant
     to outlive the room. */
  function useScratch(){ visiting=false; scratch=true; }
  function enter(parent){
    if(group && group.parent) group.parent.remove(group);
    /* A visitor's project is already in P — adopt() put it there — and
       load() would throw it away and open whatever this browser has in
       the sandbox instead, which is the one thing a published game must
       never turn into. */
    if(!visiting) load();
    group=new THREE.Group(); parent.add(group);
    P.actors.forEach(build);
    if(!visiting && !P.actors.length) addActor({ name:'Blocky', x:0, y:1, z:0 });
    threads=[]; running=false; t0=performance.now();
  }
  function leave(){ group=null; threads=[]; running=false; visiting=false; }
  /* THE FLAT STAGE, which is a camera and not an engine.

     Looking straight down at the floor puts the student's x across the
     screen and their y up it — the two named axes, both in full view,
     which is exactly the plane move/turn/point already work in. (Height
     is z, and from up here it points at the viewer, so a flat game is one
     where z never changes: Scratch, arrived at rather than imitated.) Framed on everything the project contains rather than on a fixed
     box, so a small game fills the screen and a big one fits — measured
     once when the stage opens, not per frame, or a clone flying off the
     edge slowly zooms the whole game out. */
  let framed=0, flatCam=null;
  function stageCam(aspect){
    /* IT HAS TO BE AN ORTHOGRAPHIC CAMERA, not the room's perspective one
       pushed a long way back. A flat game is played by reading positions
       off the screen — is the ball level with the paddle yet — and under
       perspective two objects the same distance apart are different
       distances apart depending where they sit. */
    if(!flatCam) flatCam=new THREE.OrthographicCamera(-1,1,1,-1,0.1,400);
    if(!framed){
      let r=6;
      P.actors.forEach(a=>{ r=Math.max(r, Math.abs(a.x)+a.size, Math.abs(a.z)+a.size); });
      framed=r*1.25+2;
    }
    const h=framed, w=h*(aspect||1.6);
    flatCam.left=-w; flatCam.right=w; flatCam.top=h; flatCam.bottom=-h;
    flatCam.position.set(0, 120, 0);
    /* WHICH WAY ROUND THE FLOOR IS, and you do not get to have both.

       Looking straight down at the ground plane, +x to the right and +z
       up the screen is a LEFT-handed frame — x cross z is minus y, and y
       is the direction the camera is looking from. So one of the two has
       to land the other way, and it is x that wins: a student reads left
       to right before they read anything else, and `change x by 1` going
       leftwards would be wrong in a way `y runs downward` is not.

       So +z comes DOWN the screen — which is also the honest picture of
       what the top view IS. In the room the camera stands out along +z,
       so the direction that was coming towards you is the direction that
       now goes down the screen, towards where you were standing. The
       ring's legend says so rather than leaving it to be discovered. */
    flatCam.up.set(0,0,-1);
    flatCam.lookAt(0,0,0);
    flatCam.updateProjectionMatrix();
    return flatCam;
  }
  function reframe(){ framed=0; }
  function reset(){
    P.actors.slice().forEach(delActor);
    P.actors.length=0; P.procs.length=0; P.msgs.length=0; P.msgs.push('message1');
    Object.keys(P.vars).forEach(k=>delete P.vars[k]);
    Object.keys(P.lists).forEach(k=>delete P.lists[k]);
    threads=[]; running=false;
  }
  function wipe(){ reset(); uid=1; addActor({name:'Blocky',x:0,y:1,z:0}); save(); }

  return {
    get project(){ return P; },
    get running(){ return running; },
    get runId(){ return runId; },
    get threadCount(){ return threads.length; },
    enter, leave, step, save, load, wipe, reset, resetActor, dress, setHome, runBlock, ghostMesh,
    useSlot, useScratch,
    get scratch(){ return scratch; },
    adopt, install, stageCam, reframe, plain,
    get visiting(){ return visiting; },
    get flat(){ return isFlat(); },
    set stage(v){ P.stage = v==='flat'?'flat':'world'; save(); },
    get stage(){ return P.stage||'world'; },
    addActor, delActor, build, sync, actorByName,
    greenFlag, stopAll, startHats,
    evalBlock, lookup, num, truthy
  };
})();
