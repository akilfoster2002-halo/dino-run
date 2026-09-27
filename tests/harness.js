/* =====================================================================
   A HEADLESS DESERT — the real language, VM and costumes, with no screen.

   blocks.js, vm.js, costumes.js and the room's own script builder are
   loaded into a sandbox exactly as the page loads them. The only thing
   faked is what a browser provides: a THREE that remembers positions and
   children and draws nothing, a canvas that is never shown, a keyboard
   that is a plain object, and a clock that moves 1/60 s per step — so a
   two-minute game runs in well under a second, the same way every time.
   ===================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname,'..',f),'utf8');

function three(){
  const v3=(x=0,y=0,z=0)=>({ x,y,z,
    set(a,b,c){ this.x=a; this.y=b; this.z=c; return this; },
    setScalar(s){ this.x=this.y=this.z=s; return this; },
    multiplyScalar(s){ this.x*=s; this.y*=s; this.z*=s; return this; } });
  class Obj{
    constructor(){ this.children=[]; this.parent=null; this.userData={}; this.visible=true;
      this.position=v3(); this.rotation=v3(); this.scale=v3(1,1,1); }
    add(o){ if(o.parent) o.parent.remove(o); o.parent=this; this.children.push(o); return this; }
    remove(o){ const i=this.children.indexOf(o); if(i>=0){ this.children.splice(i,1); o.parent=null; } return this; }
  }
  class Geo{ translate(){ return this; } dispose(){} }
  class Mat{ constructor(o){ Object.assign(this,o||{}); this.color={ set(){} }; } }
  return {
    Group:class extends Obj{}, Scene:class extends Obj{},
    Mesh:class extends Obj{ constructor(g,m){ super(); this.geometry=g; this.material=m; } },
    Sprite:class extends Obj{ constructor(m){ super(); this.material=m; } },
    BoxGeometry:Geo, SphereGeometry:Geo, CylinderGeometry:Geo, ConeGeometry:Geo, PlaneGeometry:Geo,
    MeshLambertMaterial:Mat, MeshBasicMaterial:Mat, SpriteMaterial:Mat,
    Color:class{ set(){ return this; } }, CanvasTexture:class{},
    NearestFilter:1, SRGBColorSpace:'srgb'
  };
}

/* a Math whose random is a seeded generator, so a run can be repeated */
function seeded(seed){
  let s=seed>>>0 || 1;
  const M=Object.create(Math);
  M.random=()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; };
  return M;
}

function desert(seed){
  let now=0;
  const ctx=vm.createContext({
    console, Math:seeded(seed||1),
    performance:{ now:()=>now },
    localStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    document:{ createElement:()=>({ width:0, height:0,
      getContext:()=>({ createImageData:(w,h)=>({ data:new Uint8ClampedArray(w*h*4) }),
                         putImageData(){} }) }) },
    uiFont:()=>'monospace'
  });
  ctx.window=ctx; ctx.self=ctx;
  ctx.THREE=three();
  ctx.G={ keys:{}, hits:[], pos:{ x:0, y:0, z:0 }, room:'dino' };
  ['blocks.js','vm.js','costumes.js','dino.js'].forEach(f=>
    vm.runInContext(read(f), ctx, { filename:f }));
  const { VM, COSTUMES, DINO, BLOCKS } = ctx;

  /* THE ROOM'S cast(), off the room's own list: every object where the
     page puts it, wearing what the page dresses it in */
  const root=new ctx.THREE.Group();
  VM.useScratch(); VM.enter(root);
  VM.project.actors.slice().forEach(a=>VM.delActor(a));
  const N=DINO.NUM, S=DINO.scripts();
  DINO.CAST.forEach(c=>{
    const a=VM.addActor({ name:c.name, shape:c.shape, size:1 });
    a.x=c.x; a.z=-c.y; a.y=1; a.visible=c.visible; a.vars=Object.assign({}, c.vars);
    a.scripts=JSON.parse(JSON.stringify(S[c.name]));
    VM.sync(a); VM.setHome(a);
  });
  VM.project.vars.speed=N.SPEED; VM.project.vars.score=0; VM.project.vars.next=0;

  let t=0;
  function step(){
    VM.step(1/60);
    now+=1000/60; t+=1/60;
  }
  const dino = () => VM.actorByName(DINO.DINO);
  const names = DINO.OBSTACLES.map(o=>o.name);
  const obstacles = () => VM.project.actors.filter(a=>names.includes(a.name) && a.isClone && a.visible);
  return { ctx, VM, COSTUMES, DINO, BLOCKS, G:ctx.G, step, dino, obstacles,
           get seconds(){ return t; } };
}

/* A PLAYER: presses SPACE a few frames before a cactus or a low bird,
   holds ↓ for a bird at head height, and ignores one flying overhead.
   `lead` is how many frames early it jumps. */
function player(d, lead){
  const me=d.COSTUMES.rect(d.dino());
  let next=null, gap=Infinity;
  d.obstacles().forEach(o=>{
    const r=d.COSTUMES.rect(o); if(!r || r.x1<me.x0) return;
    const g=r.x0-me.x1; if(g<gap){ gap=g; next=o; }
  });
  d.G.keys.Space=false; d.G.keys.ArrowDown=false;
  if(!next) return;
  const sp=+d.VM.project.vars.speed, bird=next.shape==='desert/bird', y=-next.z;
  if(bird && y>2) return;
  if(bird && y>1){ if(gap<sp*10) d.G.keys.ArrowDown=true; return; }
  if(gap<sp*lead) d.G.keys.Space=true;
}

module.exports = { desert, player, read };
