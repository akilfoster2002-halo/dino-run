/* =====================================================================
   BOOT — the renderer, the keyboard and the frame loop, and nothing else.

   The same shim Pong's and Asteroid Dodge's standalone pages use in place
   of KORO's game.js: blocks.js, vm.js and coder.js only need a scene, a
   camera, somewhere to read the keyboard and something calling them.
   Everything that is the game is in dino.js.

   ONE DIFFERENCE. The VM runs a `forever` once a frame, so on a 120 Hz
   screen every loop in the game runs twice as often — the cactuses slide
   twice as fast while the Dino's glide, which is timed in seconds, does
   not. Pong gets away with that; a runner does not, because the whole
   game is whether you clear the cactus. So the game is stepped on its own
   clock, sixty times a second, however often the screen draws.
   ===================================================================== */
(function(){
  const $ = s => document.querySelector(s);

  const G = window.G = {
    renderer:null, scene:null, camera:null, roomGroup:null,
    solids:[], hits:[], ceiling:null, ground:()=>0,
    keys:{}, pos:{ x:0, y:0, z:0 },
    running:false, firstPerson:false,
    room:null, hudOwner:null, missionId:null, focused:null, selected:null
  };

  /* `say` draws its bubble in the page's typeface and asks uiFont() which
     that is; game.js defines it in the full game, so it is defined here */
  let _face=null;
  window.uiFont = window.uiFont || function uiFont(){
    if(_face===null){
      try{ _face=getComputedStyle(document.documentElement).getPropertyValue('--font').trim(); }
      catch(e){ _face=''; }
      if(!_face) _face='ui-monospace,Menlo,Consolas,monospace';
    }
    return _face;
  };

  const typing = el => !!(el && (el.tagName==='INPUT' || el.tagName==='TEXTAREA' ||
                                 el.tagName==='SELECT' || el.isContentEditable));
  const STEER=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'];

  const STEP=1/60;
  function boot(){
    const canvas=$('#view');
    G.renderer=new THREE.WebGLRenderer({ canvas, antialias:false });
    G.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    G.scene=new THREE.Scene();
    G.camera=new THREE.PerspectiveCamera(60,1,0.3,400);
    size(); addEventListener('resize', size);

    addEventListener('keydown', e=>{
      if(typing(e.target)) return;
      G.keys[e.code]=true;
      if(e.code==='KeyC' && !e.metaKey && !e.ctrlKey && window.CODER){ e.preventDefault(); CODER.toggle(); }
      if(STEER.includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e=>{ G.keys[e.code]=false; });
    addEventListener('blur', ()=>{ for(const k in G.keys) G.keys[k]=false; });

    DINO.start();

    let last=performance.now(), acc=0;
    (function frame(now){
      requestAnimationFrame(frame);
      const dt=Math.min(0.1, (now-last)/1000); last=now;
      acc+=dt;
      /* a 60 Hz frame is never exactly 1/60 s — within two milliseconds
         of it is one step, or the game stutters between none and two */
      if(Math.abs(acc-STEP)<0.002) acc=STEP;
      let n=0;
      while(acc>=STEP && n<4){ DINO.step(STEP); acc-=STEP; n++; }
      if(n===4) acc=0;              // a machine this far behind drops time rather than piling it up
      DINO.draw(dt);
      if(G.scene && G.camera) G.renderer.render(G.scene, G.camera);
    })(last);
  }
  function size(){
    G.renderer.setSize(innerWidth, innerHeight, false);
    if(G.camera && G.camera.isPerspectiveCamera){
      G.camera.aspect=innerWidth/Math.max(1,innerHeight);
      G.camera.updateProjectionMatrix();
    }
  }

  if(!window.THREE){ fail('The 3D library did not load.'); return; }
  try{ boot(); }
  catch(e){ fail(e && e.message ? e.message : String(e)); }

  function fail(why){
    const T=s=>(window.t ? t(s) : s);
    const el=document.createElement('div');
    el.className='dn-sorry';
    el.innerHTML='<b>'+T('Dino Run could not start')+'</b><small>'+
      String(why).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+
      '</small><small>'+T('Try a different browser, or ask a teacher.')+'</small>';
    document.body.appendChild(el);
    console.error('[dino]', why);
  }
})();
