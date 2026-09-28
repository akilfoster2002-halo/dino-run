# Dino Run — build it yourself, out of blocks

The dinosaur runner game, as a blank page for students to build.

Every time the page opens (and every refresh) there are three objects, and only the Ground has code:

| | |
|---|---|
| **Dino** | standing on the ground at x = −12, no code |
| **Cactus** | standing on the ground at x = 10, no code |
| **Ground** | the desert line, already sliding: press **SPACE** and the Dino looks like it runs |

Students click an object (or press **C**) and write its blocks, then press **SPACE** to run them. The
start card lists what to build, in English and Spanish:

1. **Ground (already done):** it slides left `forever` with `change x by -0.3`; when
   `x position < -32`, `change x by 32` so it never runs out. Students read it as the example for
   the Cactus.
2. **Cactus:** slide left the same way; when `x position < -20`, `set x to 20` so it comes back.
3. **Dino:** `when space key pressed`, `glide` up to `y 6`, then `glide` back down to `y 0`.
4. **Game over:** on the Cactus, `if touching Dino?` then `stop all`.
5. **Score:** on the Ground, `change score by 0.2` inside the `forever`.

A `score` variable is made ready (the editor here has no "make a variable" button), and the
scoreboard in the corner shows it. The block shelf holds only what the game needs.

Code lasts until the page is refreshed. **↺** also puts the page back the way it opened. Only the high score, the language and
the sound setting are remembered by the browser.

**Teacher answer key:** open the page with `?answer` on the end, e.g.
https://dino-run-sepia.vercel.app/?answer. It loads the finished game (28 blocks) and says
"Teacher view" in the corner. Nothing about it is saved, and students never see it unless they add
`?answer` themselves.

The room (`dino.js`) owns only the stage: the sky, clouds, camera, sounds, high score and night mode.
It never moves anything, never ends the game and never decides a hit — that is all the students'
blocks.

## Language, sound, touch

- **🌐 Español / English** switches the start card, buttons and messages, plus the editor's own
  buttons. Block words stay in English because they are the code, and key names stay as printed on the
  keyboard (`SPACE`). The choice is remembered per machine.
- **🔊 / 🔇** switches the three beeps (jump, every 100, crash). They are synthesised; no audio files.
- On a touch screen, a tap on the desert is SPACE.

## Play it online

- **https://dino-run-sepia.vercel.app** (Vercel)
- **https://mesacs-0-2.onrender.com/4/** (the 0.2 site on Render)

Both redeploy by themselves when `main` is pushed to GitHub: the Vercel project `dino-run` is
connected to the MESACS_0.2 repo with its Root Directory set to `4`.

## Running it

It is a plain static folder, with no build step, no install and no network. Copy the whole folder
and double-click `index.html`; it runs from disk. In the 0.2 site it is served at `/4/`. To serve it
locally instead:

```bash
python3 -m http.server 8796
```

Then open http://localhost:8796.

```bash
npm test        # 28 tests, no browser needed
npm run bump    # moves ?v= on every tag so caches cannot serve half a build
```

The tests check that every page load hands over only the Ground's code, and that with it the Ground
slides and wraps while the Dino and the Cactus stay put until a student writes their code, then **play the teacher's answer key headless**: the real VM runs the real blocks with a
stand-in renderer and a 60 Hz clock. A player who jumps on time must survive a minute; one who does
nothing, or jumps far too early or too late, must lose.

## How it is built

It uses the block-coding framework from **MESACS 0.2a**, with the same files as Pong and Asteroid
Dodge:

| file | job |
|---|---|
| `blocks.js` | the language: every block as data |
| `vm.js` | runs the blocks: threads, clones, `touching`, `stop all` |
| `coder.js` | the drag-and-drop block editor |
| `strings.js`, `app.css`, `fonts/`, `lib/three.classic.js` | text, styles, typefaces, renderer |
| **`costumes.js`** | the pixel art (Dino, ducking, crashed, cactuses, bird, ground, cloud), one still picture each, with the same interface as 0.2a's costume module |
| **`dino.js`** | the room: the three objects, the answer key, the camera, HUD, sounds, Spanish |
| **`boot.js`** | renderer, keyboard and frame loop, stepping the game at a fixed 60 per second |

The framework files were copied from the Asteroid Dodge folder (which carries the fix that makes
`touching [name]?` see clones). **A fix made here does not reach 0.2a, and one made there does not
reach here.**

### Three small changes to `vm.js`

1. **`touching` asks the costume first.** Two drawn costumes touch where their *pixels* overlap, the way
   Scratch does it, so the Dino's tail can brush past a cactus arm and live. Anything else falls back
   to the VM's usual sphere.
2. **`become a [costume]` does nothing when already wearing it.** The Dino says `become a [Dino]` every
   frame it is not ducking; before this, that rebuilt the object sixty times a second.
3. **A deleted clone frees its click box.** The runner makes about one clone a second, forever.

### Two things `boot.js` does that Pong's does not

- **A fixed clock.** The VM runs each `forever` once per frame, so on a 120 Hz screen the cactuses,
  the ground and the speed-up would all run twice as fast. The game is stepped at 60 per second
  whatever the screen does.
- **The camera frames a window of the world**, not the objects. With the editor open, that window is
  fitted into the gap between the block list and the script, so you can change a number, press SPACE
  and watch it without closing anything.

Every character is **one still picture**: no running legs, blinking or flapping. A costume only changes
when a block says `become a [...]`.

The art is drawn fresh for this game in the style of the original; it is not Google's sprite sheet.
