/* =====================================================================
   COSTUMES — what an object can look like, drawn in pixels.

   The same module KORO has, with the same shape: shelves a student can
   pick from, an id per costume, `isModel` to tell the VM which ones are
   not plain geometry, and `load` to hand it something to put in the
   world. The difference is what comes back. KORO's costumes are .glb
   models fetched off disk; these are pixel drawings written out below as
   rows of characters, turned into a flat picture lying on the floor for
   the overhead camera to look straight down at.

     #   ink       o   paper (an eye, a highlight)       .   nothing

   ONE PICTURE PER COSTUME, and it does not move. No running legs, no
   blinking, no flapping: what a thing looks like only changes when a
   block says `become a [...]`, so everything on the screen is something
   a student can find in the code.

   One pixel of art is a tenth of a square, so the Dino — 22 × 24 — is
   2.2 squares wide and 2.4 tall, and those are the numbers a student
   meets in the blocks: a bird at y = 2.6 flies over a standing Dino and
   one at y = 1.3 does not.

   WHERE A COSTUME STANDS. Every costume's position is the middle of its
   BOTTOM edge, not its centre. `y position` = 0 is feet on the ground,
   which is the sentence a jump is written in.

   LOADING IS INSTANT. vm.js asks for a costume with `load(id).then(...)`
   because a model takes a fetch; a drawing does not, and a Promise would
   still hand it over a frame late — which is a frame with no Dino in it
   every time it ducks. So `load` returns a thenable that calls back at
   once.

   AND TWO DRAWINGS TOUCH WHERE THEIR PIXELS DO. `touching` answers for
   any pair of drawn costumes by laying one mask over the other — the
   Dino's tail can brush past a cactus's arm and live. For anything else
   it says null and the VM uses its usual sphere.
   ===================================================================== */
window.COSTUMES = (function(){
  const PX = 0.1;                               // one art pixel, in squares
  const INK = '#535353', PAPER = '#f7f7f7';

  /* ================================================================ art */
  const DINO_HEAD = [
    '............#########.',
    '...........##o########',
    '...........###########',
    '...........###########',
    '...........###########',
    '...........######.....',
    '...........#########..',
    '..........#######.....',
    '#........########.....',
    '#.......##########....',
    '##.....########.##....',
    '###...#########..#....',
    '####.##########.......',
    '###############.......',
    '.##############.......',
    '..#############.......',
    '...###########........',
    '....#########.........',
    '.....#######..........'
  ];
  const LEGS = [
    '......###.##..........',
    '......##...#..........',
    '......#....#..........',
    '......#....#..........',
    '......##...##.........'
  ];
  const DEAD = DINO_HEAD.map((r,i)=>{
    if(i===0) return '............#########.';
    if(i===1) return '...........#ooo#######';
    if(i===2) return '...........#o#o#######';
    if(i===3) return '...........#ooo#######';
    if(i===5) return '...........##########.';
    if(i===6) return '...........#########..';
    return r;
  });

  const DUCK = [
    '#.....##########...##########.',
    '##..##############.##o#######.',
    '.#############################',
    '..############################',
    '...##########################.',
    '....####################.....',
    '.....##########.####.#######..',
    '......#####.##..#.............',
    '......##...##.................',
    '......#.....#.................',
    '......##....##................'
  ];

  const CACTUS = [
    '....##...',
    '...####..',
    '...####..',
    '...####.#',
    '#..####.#',
    '#..####.#',
    '#..####.#',
    '#..######',
    '#..#####.',
    '##.####..',
    '.######..',
    '..#####..',
    '...####..',
    '...####..',
    '...####..',
    '...####..',
    '...####..',
    '...####..'
  ];
  const BIG = [
    '.....###.....',
    '....#####....',
    '....#####....',
    '....#####....',
    '....#####..#.',
    '.#..#####.###',
    '###.#####.###',
    '###.#####.###',
    '###.#####.###',
    '###.#####.###',
    '###.#####.###',
    '###.#########',
    '###.########.',
    '###.#######..',
    '#########....',
    '.########....',
    '..#######....',
    '....#####....',
    '....#####....',
    '....#####....',
    '....#####....',
    '....#####....',
    '....#####....',
    '....#####....',
    '....#####....'
  ];
  /* a big one between two small ones, bottoms level */
  const GROUP = (()=>{
    const pad=(rows,h)=>Array(h-rows.length).fill('.'.repeat(rows[0].length)).concat(rows);
    const h=BIG.length, s=pad(CACTUS,h);
    return BIG.map((r,i)=>s[i]+'.'+r+'.'+s[i]);
  })();

  /* a pterodactyl, flying left: beak and crest at the front, wing up.
     The bottom of the picture is its belly, so a bird's `y position` is
     where it flies clear of: at 1.3 a ducking Dino fits under it. */
  const BIRD = [
    '..............#...........',
    '..............##..........',
    '..............###.........',
    '..............####........',
    '..............#####.......',
    '....#.........######......',
    '...##.........#######.....',
    '..####........########....',
    '.###o#################....',
    '##########################',
    '......###################.',
    '.......##############.....',
    '.........#######..........'
  ];

  const CLOUD = [
    '..........######.......',
    '.......###......##.....',
    '......#...........#....',
    '...###.............###.',
    '.##...................#',
    '#.....................#',
    '.######################'
  ];

  /* THE GROUND TILES EVERY 32 SQUARES — 320 pixels of line, bumps and
     pebbles, drawn once and repeated four times. The Ground's own script
     slides it left and, every 32 squares, jumps it back by 32: the
     picture it jumps to is the picture it left, so nobody sees the seam. */
  const GROUND = (()=>{
    const W=320, reps=4;
    let seed=7;
    const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
    const rows=[[],[],[],[],[],[]].map(()=>Array(W).fill('.'));
    for(let x=0;x<W;x++) rows[1][x]='#';
    /* the odd bump in the line */
    for(let x=6;x<W-8;x+=10+Math.floor(rnd()*28)){
      const w=2+Math.floor(rnd()*4);
      for(let i=0;i<w;i++){ rows[0][x+i]='#'; rows[1][x+i]='.'; }
      rows[1][x]='#'; rows[1][x+w-1]='#';
    }
    /* and pebbles and dashes underneath */
    for(let x=2;x<W-4;x+=3+Math.floor(rnd()*9)){
      const r=2+Math.floor(rnd()*4), w=1+Math.floor(rnd()*3);
      for(let i=0;i<w;i++) rows[r][x+i]='#';
    }
    return rows.map(r=>{ const s=r.join(''); return s.repeat(reps); });
  })();

  /* ============================================================ costumes
     art      the picture
     below    how many pixel rows hang under y = 0 (the ground's pebbles)
     layer    what draws on top of what: the Dino over a cactus it hits */
  const C = {
    'dino/dino':      { name:'Dino',         layer:3, art:DINO_HEAD.concat(LEGS) },
    'dino/ducking':   { name:'Dino ducking', layer:3, art:DUCK },
    'dino/crashed':   { name:'Dino crashed', layer:3, art:DEAD.concat(LEGS) },
    'desert/cactus':  { name:'Small cactus', layer:2, art:CACTUS },
    'desert/big':     { name:'Big cactus',   layer:2, art:BIG },
    'desert/group':   { name:'Cactus group', layer:2, art:GROUP },
    'desert/bird':    { name:'Bird',         layer:2, art:BIRD },
    'desert/ground':  { name:'Ground',       layer:0, art:GROUND, below:4 },
    'desert/cloud':   { name:'Cloud',        layer:-1, art:CLOUD }
  };

  const it=(file,name)=>({ file, name });
  const SHAPES=['cube','ball','cylinder','cone'];
  const SHELVES=[
    { id:'dino', name:'Dino', dir:null, thumbs:null, items:[
        it('dino','Dino'), it('ducking','Dino ducking'), it('crashed','Dino crashed') ] },
    { id:'desert', name:'Desert', dir:null, thumbs:null, items:[
        it('cactus','Small cactus'), it('big','Big cactus'), it('group','Cactus group'),
        it('bird','Bird'), it('ground','Ground'), it('cloud','Cloud') ] },
    { id:'shapes', name:'Shapes', dir:null, thumbs:null, items:[
        it('cube','Cube'), it('ball','Ball'), it('cylinder','Cylinder'), it('cone','Cone') ] }
  ];
  const id = (shelf,f) => shelf==='shapes' ? f : shelf+'/'+f;
  const isModel = cid => !!C[String(cid)];
  function find(cid){
    const [sh,f]=String(cid).split('/');
    const s=SHELVES.find(x=>x.id===sh); return s ? s.items.find(x=>x.file===f)||null : null;
  }
  function nameOf(cid){
    if(C[cid]) return C[cid].name;
    const s=String(cid||'cube'); return s.charAt(0).toUpperCase()+s.slice(1);
  }
  const thumbOf = () => null;
  const clips = () => [];
  function all(){
    const out=[];
    SHELVES.forEach(s=>s.items.forEach(x=>out.push(id(s.id,x.file))));
    return out;
  }

  /* ============================================================ drawing
     Each costume is painted once onto a canvas one pixel per art pixel and
     kept: every object wearing it, clones and all, shares the picture.
     Nearest-neighbour filtering is what keeps a pixel a square when the
     camera blows it up forty times. */
  const made = {};                  // cid -> { w, h, mask, tex }
  function sheet(cid){
    if(made[cid]) return made[cid];
    const rows=C[cid].art, h=rows.length, w=Math.max(...rows.map(r=>r.length));
    const mask=new Uint8Array(w*h);
    rows.forEach((r,j)=>{ for(let i=0;i<r.length;i++)
      if(r[i]==='#'||r[i]==='o') mask[j*w+i] = r[i]==='#' ? 1 : 2; });
    return (made[cid]={ w, h, mask, tex:null });
  }
  function texture(cid){
    const sh=sheet(cid);
    if(sh.tex) return sh.tex;
    const cv=document.createElement('canvas'); cv.width=sh.w; cv.height=sh.h;
    const x=cv.getContext('2d'), img=x.createImageData(sh.w, sh.h);
    const ink=hex(INK), paper=hex(PAPER);
    for(let p=0;p<sh.mask.length;p++){
      const m=sh.mask[p]; if(!m) continue;
      const c=m===1?ink:paper;
      img.data[p*4]=c[0]; img.data[p*4+1]=c[1]; img.data[p*4+2]=c[2]; img.data[p*4+3]=255;
    }
    x.putImageData(img,0,0);
    const tex=new THREE.CanvasTexture(cv);
    tex.magFilter=THREE.NearestFilter; tex.minFilter=THREE.NearestFilter;
    tex.generateMipmaps=false;
    if(THREE.SRGBColorSpace) tex.colorSpace=THREE.SRGBColorSpace;
    return (sh.tex=tex);
  }
  function hex(h){ const n=parseInt(h.slice(1),16); return [n>>16&255, n>>8&255, n&255]; }

  /* ONE GEOMETRY PER COSTUME, shifted so the origin is the middle of the
     bottom edge (less whatever hangs below the ground line) */
  const geos = {};
  function geometry(cid){
    if(geos[cid]) return geos[cid];
    const sh=sheet(cid), c=C[cid];
    const g=new THREE.PlaneGeometry(sh.w*PX, sh.h*PX);
    g.translate(0, sh.h*PX/2 - (c.below||0)*PX, 0);
    return (geos[cid]=g);
  }

  function make(cid){
    const c=C[cid];
    const mat=new THREE.MeshBasicMaterial({ map:texture(cid), alphaTest:0.5 });
    const plane=new THREE.Mesh(geometry(cid), mat);
    plane.rotation.x=-Math.PI/2;                  // lying flat, top of the picture up the screen
    plane.position.y=0.02*(c.layer||0);
    const o=new THREE.Group();
    o.add(plane);
    o.userData.sprite={ cid };
    return o;
  }
  /* A THENABLE, NOT A PROMISE: calls back before it returns, so the
     costume is on the object in the same frame it was asked for. */
  function load(cid){
    const done={ then(ok,bad){ try{ ok && ok(make(String(cid))); }catch(e){ if(bad) bad(e); }
                               return done; },
                 catch(){ return done; } };
    return done;
  }

  /* ========================================================== touching */
  /* where an object's picture is, in the language's squares */
  function rect(a){
    if(!a || !C[a.shape]) return null;
    const c=C[a.shape], sh=sheet(a.shape), px=PX*Math.max(0.1, a.size||1);
    const x0=a.x - sh.w*px/2, y0=(-a.z) - (c.below||0)*px;
    return { x0, y0, x1:x0+sh.w*px, y1:y0+sh.h*px, px, w:sh.w, h:sh.h, mask:sh.mask };
  }
  function solid(r, x, y){
    const i=Math.floor((x-r.x0)/r.px), j=Math.floor((r.y1-y)/r.px);
    if(i<0||j<0||i>=r.w||j>=r.h) return false;
    return r.mask[j*r.w+i]>0;
  }
  function touching(a, b){
    const A=rect(a), B=rect(b);
    if(!A || !B) return null;                    // not two drawings: ask the sphere
    const x0=Math.max(A.x0,B.x0), x1=Math.min(A.x1,B.x1);
    const y0=Math.max(A.y0,B.y0), y1=Math.min(A.y1,B.y1);
    if(x0>=x1 || y0>=y1) return false;
    /* half a pixel of the finer of the two, so nothing one pixel thick
       slips between the samples */
    const step=Math.min(A.px,B.px)/2;
    for(let y=y0+step/2; y<y1; y+=step)
      for(let x=x0+step/2; x<x1; x+=step)
        if(solid(A,x,y) && solid(B,x,y)) return true;
    return false;
  }
  /* is this point (in squares) on the object's picture — for clicking it */
  function hit(a, x, y, loose){
    const r=rect(a); if(!r) return false;
    if(x<r.x0||x>r.x1||y<r.y0||y>r.y1) return false;
    return loose ? true : solid(r,x,y);
  }

  return { SHELVES, SHAPES, isModel, load, clips, nameOf, thumbOf, all, id, find,
           touching, rect, hit, make, PX, INK, PAPER, C };
})();
