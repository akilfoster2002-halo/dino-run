/* =====================================================================
   BLOCKS — the language, as data.

   Every block a student can write is one row here: its shape, its
   category, the words it reads as, and the slots inside it. The editor
   renders from this table and the VM executes from the same table, so a
   block cannot exist in one and be missing from the other.

   SHAPES, which is really the grammar:
     hat     starts a script     — when ▶ clicked
     stack   does something      — move 10 steps
     c       wraps other blocks  — repeat 10 [ ... ]
     c2      wraps two           — if <> [ ... ] else [ ... ]
     cap     ends a script       — stop this script
     report  gives a number/text — x position, 3 + 4
     bool    gives a yes or no   — touching player?

   THE THREE AXES, which are named for what a student can point at:
     x   across the screen, left and right
     y   into the screen and back out
     z   up
   x and y are the two you can see the whole of from where the camera
   stands, so they are the two with the short names, and the pair a first
   program reaches for. The engine underneath is Y-up like every 3D
   engine; vm.js maps between them in one line and nothing else in the
   game knows the difference.

   A slot's type says what may drop into it: `num` and `str` take a typed
   value or any reporter, `bool` takes only a boolean block, and `key`,
   `var` and `msg` are dropdowns — over the keyboard, and over the things
   the project has made. A dropdown never holds a block; see holdsBlock.
   ===================================================================== */
window.BLOCKS = (function(){

  const CATS=[
    { id:'events',  name:'Events',    a:'#ffd8a8' },
    { id:'control', name:'Control',   a:'#ffb4a2' },
    { id:'motion',  name:'Motion',    a:'#8fd3ff' },
    { id:'looks',   name:'Looks',     a:'#cdb4f6' },
    { id:'sensing', name:'Sensing',   a:'#a8e6cf' },
    { id:'ops',     name:'Operators', a:'#9fe6b4' },
    { id:'data',    name:'Variables', a:'#ffc48f' },
    { id:'my',      name:'My Blocks', a:'#ff9aa2' }
  ];

  const n=(d)=>({type:'num',def:d});
  const s=(d)=>({type:'str',def:d});
  const b=()=>({type:'bool'});
  const B=(op,cat,kind,label,args)=>({op,cat,kind,label,args:args||{}});

  /* ---------------------------------------------------------------- keys
     THE KEYBOARD IS A CLOSED LIST, and a key slot is a menu over it rather
     than a box to type in. A typed field looks like it works: "Shift",
     "spacebar", "arrow up" all sit in the block reading perfectly well,
     none of them ever fires, and there is nothing on screen to say why.
     Every name below has exactly one code the VM can ask the browser
     about, and nothing that is not on the list can get into the slot.

     The stored value is the short lowercase name — 'up', not 'ArrowUp' —
     because it is also the word the student reads inside the block. The
     codes are KeyboardEvent.code, the layout-independent one: 'KeyW' is
     the key with W printed on it whatever the keyboard is set to.

     'any' is Scratch's, and earns its place on a first program: one hat,
     any key, something happens. */
  const NAMED = {
    any:'any', space:'Space', enter:'Enter',
    up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight'
  };
  /* what a saved project, or a student reading the label back in, might
     have put there instead */
  const ALIAS = {
    'up arrow':'up', 'down arrow':'down', 'left arrow':'left',
    'right arrow':'right', 'spacebar':'space', ' ':'space', 'return':'enter'
  };
  const SPLIT = s => String(s).split('');
  /* the dropdown, in Scratch's order: the big keys, then the alphabet,
     then the numbers. `v` is stored, `name` is read. */
  const KEYS = [
    { v:'any',   name:'any'         },
    { v:'space', name:'space'       },
    { v:'up',    name:'up arrow'    },
    { v:'down',  name:'down arrow'  },
    { v:'left',  name:'left arrow'  },
    { v:'right', name:'right arrow' },
    { v:'enter', name:'enter'       },
    ...SPLIT('abcdefghijklmnopqrstuvwxyz').map(v=>({v,name:v})),
    ...SPLIT('0123456789').map(v=>({v,name:v}))
  ];
  /* A key name to the browser's code for it, or '' for a name that is not
     a key at all — and an empty code is a key nobody is ever pressing,
     which is how a junk value fails: quietly false, never a crash. */
  function keyCode(k){
    k=String(k==null?'':k).trim().toLowerCase();
    if(ALIAS[k]) k=ALIAS[k];
    if(NAMED[k]) return NAMED[k];
    if(/^[a-z]$/.test(k)) return 'Key'+k.toUpperCase();
    if(/^[0-9]$/.test(k)) return 'Digit'+k;
    return '';
  }
  const isKey = k => !!keyCode(k);

  /* WHICH SLOTS HOLD A BLOCK. `num` and `str` take a typed value or any
     reporter, `bool` takes a boolean block and nothing else. Every other
     type is a MENU over things that exist — a key, a variable, a message,
     a costume — and a menu cannot hold a block: dropping `key [space]
     pressed?` into the key field of `when %k key pressed` is how you get a
     hat that reads "when key space pressed? key pressed" and does nothing.
     The editor asks this before it offers a slot as a drop target. */
  const holdsBlock = sp => !!sp && (sp.type==='num'||sp.type==='str'||sp.type==='bool');

  /* ---------------------------------------------------------------- axes
     THE THREE DIRECTIONS, and the one place they are written down.

     `v` is what the student types and reads. `field` is where the engine
     keeps it and `sign` is which way round: Three.js is Y-up and always
     will be, so the language's z lives in the engine's y and the
     language's y in the engine's z.

     AND y RUNS THE OTHER WAY DOWN THAT AXIS. The room's camera stands
     out along the engine's +z, so without the sign `change y by 1` came
     OUT of the screen towards you — the opposite of what "into the
     screen" means to anybody looking at it. The sign is the whole fix
     and it has to be applied to reads as well as writes, or `y position`
     reports the negative of where the robot is.

     It pays off in the top view too. Looking down, the screen's up is
     the engine's -z, which is exactly where +y now points — so in the 2D
     view +y goes UP the screen, the way it does in Scratch. That was the
     one thing about the flat stage that did not read right before.

     The swap happens once, here, and vm.js and the room both read it — a
     gizmo drawing an arrow one way while a block moves the other is the
     kind of wrong that takes a lesson to notice.

     `say` and `hue` are for anything that draws them. The hues are the
     game's own palette, far enough apart to tell at a glance.

     `flat` is the same axis seen from DIRECTLY ABOVE, which is a
     different sentence and not a different axis: looking down, the one
     that was coming out of the screen goes down it and the one that was
     up points at you. A legend that kept saying "in and out" while the
     camera was overhead would be describing a room nobody is looking
     at. */
  const AXES = [
    { v:'x', field:'x', sign: 1, say:'across',          flat:'across',        hue:0x8fd3ff },
    { v:'y', field:'z', sign:-1, say:'into the screen',  flat:'up the screen', hue:0xffb4a2 },
    { v:'z', field:'y', sign: 1, say:'up',               flat:'straight at you',hue:0xa8e6cf }
  ];
  const axisOf = k => AXES.find(a=>a.v===String(k==null?'':k).trim().toLowerCase()) || AXES[0];
  const axisField = k => axisOf(k).field;
  const axisSign  = k => axisOf(k).sign;
  const AXIS_NAMES = AXES.map(a=>a.v);

  const LIST=[
    /* ------------------------------------------------------------ events */
    B('event.flag','events','hat','when ▶ the game starts'),
    B('event.key','events','hat','when %k key pressed',{k:{type:'key',def:'space'}}),
    B('event.recv','events','hat','when I receive %m',{m:{type:'msg',def:'message1'}}),
    B('event.clone','events','hat','when I start as a clone'),
    B('event.send','events','stack','broadcast %m',{m:{type:'msg',def:'message1'}}),
    B('event.sendWait','events','stack','broadcast %m and wait',{m:{type:'msg',def:'message1'}}),

    /* ----------------------------------------------------------- control */
    B('ctrl.wait','control','stack','wait %n seconds',{n:n(1)}),
    B('ctrl.repeat','control','c','repeat %n',{n:n(10)}),
    B('ctrl.forever','control','c','forever'),
    B('ctrl.if','control','c','if %c then',{c:b()}),
    B('ctrl.ifelse','control','c2','if %c then',{c:b()}),
    B('ctrl.waitUntil','control','stack','wait until %c',{c:b()}),
    B('ctrl.repeatUntil','control','c','repeat until %c',{c:b()}),
    B('ctrl.stop','control','cap','stop %w',{w:{type:'pick',opts:['this script','all'],def:'this script'}}),
    B('ctrl.clone','control','stack','create a clone of myself'),
    B('ctrl.delclone','control','cap','delete this clone'),

    /* ------------------------------------------------------------ motion */
    B('motion.move','motion','stack','move %n steps',{n:n(10)}),
    /* TWO WAYS TO POINT A ROBOT, AND CHILDREN NEED BOTH.

       `point in direction` is the one they already understand: a facing,
       in degrees, the way a compass or Scratch does it. 90 is to the
       right. It is one number and it says where the front of the robot
       ends up, which is what somebody writing "walk that way" is
       actually thinking about.

       `turn ... by` is the honest three-dimensional one: pick an AXIS and
       spin around it. It replaced a `turn` that could only ever yaw and a
       `tilt` that could only ever pitch — two blocks that between them
       covered two of the three ways a thing can rotate, and left the
       third with no block at all. One block with the axis in it covers
       all three and says out loud that rotation HAS an axis, which is the
       idea `tilt` was hiding.

       The default is z, the up axis, because turning left and right is
       the everyday one and it is what plain `turn` always did. */
    B('motion.turn','motion','stack','turn %a by %n degrees',
      {a:{type:'pick',opts:AXIS_NAMES,def:'z'},n:n(15)}),
    B('motion.face','motion','stack','point in direction %n',{n:n(90)}),
    B('motion.goto','motion','stack','go to x %x y %y z %z',{x:n(0),y:n(0),z:n(1)}),
    B('motion.glide','motion','stack','glide %t secs to x %x y %y z %z',{t:n(1),x:n(0),y:n(0),z:n(1)}),
    /* A FIFTH OF A SQUARE, NOT A WHOLE ONE. Inside a `forever` this
       happens sixty times a second, and at 1 the robot crossed the whole
       ring in half a second — too fast to see which key did it, let alone
       to count squares. At 0.2 it walks, and a student who wants it
       quicker types a bigger number, which is the lesson. */
    B('motion.changeBy','motion','stack','change %a by %n',{a:{type:'pick',opts:AXIS_NAMES,def:'x'},n:n(0.2)}),
    B('motion.setTo','motion','stack','set %a to %n',{a:{type:'pick',opts:AXIS_NAMES,def:'x'},n:n(0)}),
    B('motion.point','motion','stack','point towards %o',{o:{type:'obj',def:'player'}}),
    B('motion.pos','motion','report','%a position',{a:{type:'pick',opts:AXIS_NAMES,def:'x'}}),
    B('motion.dir','motion','report','direction'),

    /* ------------------------------------------------------------- looks */
    B('looks.say','looks','stack','say %s',{s:s('Hello!')}),
    B('looks.sayFor','looks','stack','say %s for %n secs',{s:s('Hello!'),n:n(2)}),
    B('looks.colour','looks','stack','set colour to %s',{s:{type:'colour',def:'#8fd3ff'}}),
    B('looks.size','looks','stack','set size to %n',{n:n(1)}),
    B('looks.changeSize','looks','stack','change size by %n',{n:n(0.2)}),
    B('looks.show','looks','stack','show'),
    B('looks.hide','looks','stack','hide'),
    B('looks.shape','looks','stack','become a %s',{s:{type:'costume',def:'cube'}}),

    /* ----------------------------------------------------------- sensing */
    B('sense.dist','sensing','report','distance to %o',{o:{type:'obj',def:'player'}}),
    B('sense.touch','sensing','bool','touching %o ?',{o:{type:'obj',def:'player',edge:true}}),
    B('sense.key','sensing','bool','key %k pressed?',{k:{type:'key',def:'space'}}),
    B('sense.posOf','sensing','report','%a of %o',{a:{type:'pick',opts:AXIS_NAMES,def:'x'},o:{type:'obj',def:'player'}}),
    B('sense.timer','sensing','report','timer'),
    B('sense.resetTimer','sensing','stack','reset timer'),
    B('sense.count','sensing','report','number of %o',{o:{type:'obj',def:'clones'}}),

    /* --------------------------------------------------------- operators */
    B('op.add','ops','report','%a + %b',{a:n(1),b:n(1)}),
    B('op.sub','ops','report','%a − %b',{a:n(1),b:n(1)}),
    B('op.mul','ops','report','%a × %b',{a:n(2),b:n(3)}),
    B('op.div','ops','report','%a ÷ %b',{a:n(6),b:n(2)}),
    B('op.mod','ops','report','%a mod %b',{a:n(7),b:n(3)}),
    B('op.round','ops','report','round %a',{a:n(1.5)}),
    B('op.math','ops','report','%f of %a',{f:{type:'pick',opts:['abs','sqrt','sin','cos','floor','ceil'],def:'sqrt'},a:n(9)}),
    B('op.random','ops','report','pick random %a to %b',{a:n(1),b:n(10)}),
    B('op.lt','ops','bool','%a < %b',{a:n(0),b:n(10)}),
    B('op.gt','ops','bool','%a > %b',{a:n(0),b:n(10)}),
    B('op.eq','ops','bool','%a = %b',{a:s('a'),b:s('a')}),
    B('op.and','ops','bool','%c and %d',{c:b(),d:b()}),
    B('op.or','ops','bool','%c or %d',{c:b(),d:b()}),
    B('op.not','ops','bool','not %c',{c:b()}),
    B('op.join','ops','report','join %a %b',{a:s('hello '),b:s('world')}),

    /* --------------------------------------------------------- variables */
    B('data.set','data','stack','set %v to %n',{v:{type:'var',def:''},n:s('0')}),
    B('data.change','data','stack','change %v by %n',{v:{type:'var',def:''},n:n(1)}),
    B('data.get','data','report','%v',{v:{type:'var',def:''}}),
    B('list.add','data','stack','add %n to %l',{n:s('thing'),l:{type:'list',def:''}}),
    B('list.del','data','stack','delete %n of %l',{n:n(1),l:{type:'list',def:''}}),
    B('list.clear','data','stack','delete all of %l',{l:{type:'list',def:''}}),
    B('list.item','data','report','item %n of %l',{n:n(1),l:{type:'list',def:''}}),
    B('list.len','data','report','length of %l',{l:{type:'list',def:''}}),

    /* --------------------------------------------------------- my blocks */
    B('my.call','my','stack','%p',{p:{type:'proc',def:''}})
  ];


  /* ------------------------------------------------------------- help
     One plain sentence per block, for the magnifying glass. Written for a
     student who has not met the idea before: what it does, and when you
     would reach for it — never a restatement of the block's own words. */
  const HELP = {
    'event.flag':"Starts this script when somebody presses Run. Most projects begin with one of these.",
    'event.key':"Starts this script the moment that key goes down. Good for controls — one script per key.",
    'event.recv':"Starts this script when any object broadcasts that message. It is how objects talk to each other.",
    'event.clone':"Runs only in a copy made by 'create a clone of myself'. The original ignores it.",
    'event.send':"Shouts a message to every object at once. Anything with a matching 'when I receive' wakes up.",
    'event.sendWait':"Same as broadcast, but this script pauses until every script that answered has finished.",

    'ctrl.wait':"Pauses just this script for a while. Other scripts keep running.",
    'ctrl.repeat':"Does the blocks inside a set number of times, then carries on below.",
    'ctrl.forever':"Does the blocks inside over and over and never moves past. Nothing below it will ever run.",
    'ctrl.if':"Checks the diamond once. If it is true, runs the blocks inside; if not, skips them.",
    'ctrl.ifelse':"Runs the first set of blocks when the diamond is true, and the second set when it is false.",
    'ctrl.waitUntil':"Holds this script here until the diamond becomes true, then carries on.",
    'ctrl.repeatUntil':"Keeps doing the blocks inside until the diamond becomes true. Checks before each go.",
    'ctrl.stop':"Stops this one script, or every script in the project.",
    'ctrl.clone':"Makes a copy of this object at the same spot. The copy runs its own 'when I start as a clone'.",
    'ctrl.delclone':"Removes this copy. Has no effect on the original object.",

    'motion.move':"Slides forward in whatever direction the object is facing. Turn first to change where that is.",
    'motion.turn':"Spins the object around one axis. z turns it left and right, x tips it forward and back, y rolls it over sideways. Negative numbers go the other way.",
    'motion.face':"Points the front of the object in a direction, in degrees. 90 is to the right, 0 is away from you, -90 is to the left. Use 'turn' if you want to spin it by an amount instead.",
    'motion.goto':"Jumps straight to an exact spot. x is across, y is into the screen and back out, z is up.",
    'motion.glide':"Slides smoothly to a spot over the time you give it, instead of jumping there.",
    'motion.changeBy':"Nudges one coordinate by an amount. 'change x by 1' slides it along, 'change z by 1' lifts it.",
    'motion.setTo':"Sets one coordinate exactly, leaving the other two alone.",
    'motion.point':"Turns to face something. Handy just before 'move', to chase it.",
    'motion.pos':"Reports where the object is on one axis. Drop it into a slot to do maths with it.",
    'motion.dir':"Reports which way the object is facing, in degrees.",

    'looks.say':"Puts a speech bubble over the object and leaves it there until you say something else.",
    'looks.sayFor':"Shows a speech bubble, waits, then clears it by itself.",
    'looks.colour':"Repaints the object.",
    'looks.size':"Sets how big the object is. 1 is normal, 2 is twice as big.",
    'looks.changeSize':"Grows or shrinks the object a bit. Negative numbers shrink it.",
    'looks.show':"Makes the object visible again after hiding.",
    'looks.hide':"Makes the object invisible. Its scripts keep running while it is hidden.",
    'looks.shape':"Changes the object's costume — a shape, or anybody out of the kits. Mid-program, so a car can become a person.",

    'sense.dist':"Reports how far away something is. Compare it with a number to react when it gets close.",
    'sense.touch':"True while the object is touching that thing. Pick 'up edge', 'down edge', 'left edge' or 'right edge' for one wall of the room — that is how you keep something from wandering out.",
    'sense.key':"True while that key is held down. Use it inside 'forever' for smooth controls.",
    'sense.posOf':"Reports one coordinate of another object — how you make one thing follow another.",
    'sense.timer':"Counts seconds since the project started or the timer was reset.",
    'sense.resetTimer':"Puts the timer back to zero.",
    'sense.count':"Counts how many clones exist, or how many objects share a name.",

    'op.add':"Adds the two numbers together and reports the answer.",
    'op.sub':"Takes the second number away from the first.",
    'op.mul':"Multiplies the two numbers.",
    'op.div':"Divides the first number by the second.",
    'op.mod':"Reports the remainder after dividing. 'x mod 2' is 0 for even numbers — a neat way to alternate.",
    'op.round':"Rounds to the nearest whole number.",
    'op.math':"Does one piece of maths to a number: square root, absolute value, sine and so on.",
    'op.random':"Picks a fresh number between the two, every single time it is read.",
    'op.lt':"True when the first number is smaller than the second.",
    'op.gt':"True when the first number is bigger than the second.",
    'op.eq':"True when the two are the same. Works on words as well as numbers.",
    'op.and':"True only when BOTH diamonds are true.",
    'op.or':"True when EITHER diamond is true.",
    'op.not':"Flips a diamond over: true becomes false.",
    'op.join':"Sticks two pieces of text together, so you can say things like 'score: 12'.",

    'data.set':"Puts a value into a variable, throwing away whatever was there.",
    'data.change':"Adds to what a variable already holds. Use 1 to count things up.",
    'data.get':"Reports what a variable is holding right now. Drop it into any slot.",
    'list.add':"Puts something on the end of a list.",
    'list.del':"Removes one item. The first item is number 1, not 0.",
    'list.clear':"Empties the list completely.",
    'list.item':"Reports one item out of a list, counting from 1.",
    'list.len':"Reports how many things are in the list.",

    'my.call':"Runs a block you defined yourself. Anything you build twice is worth turning into one of these."
  };
  const help = op => HELP[op] || '';

  const BY={}; LIST.forEach(x=>BY[x.op]=x);
  const of = op => BY[op]||null;
  const inCat = c => LIST.filter(x=>x.cat===c);
  const catOf = id => CATS.find(c=>c.id===id) || CATS[0];

  /* split a label into words and %slots so the editor can lay it out */
  function parts(label){
    return String(label).split(/(%[a-z])/).filter(x=>x!=='');
  }
  const isExpr = k => k==='report' || k==='bool';

  return { CATS, LIST, of, inCat, catOf, parts, isExpr, help,
           KEYS, keyCode, isKey, holdsBlock,
           AXES, axisOf, axisField, axisSign };
})();
