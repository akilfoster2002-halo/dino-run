# Dino Run — built out of blocks

The dinosaur runner game, and every rule of it is a block you can open and change.

Open the page and press **SPACE**. The Dino runs; jump the cactuses with **SPACE** or **↑**, duck
the birds with **↓**. It gets faster the longer you last, turns to night at 700, and ends when you
hit something. Then press **C** (or **▦ BLOCKS**, or click the Dino, a cactus or the ground) and
read the blocks that just did all of that.

There are six objects and nothing else:

| | |
|---|---|
| **Dino** | jumps when SPACE/↑ is pressed *and* it is on the ground, falls because `jump` shrinks by 0.03 every frame, lands, ducks on ↓, and has one `if touching [...]` per obstacle that puts on the crashed picture and runs `stop all` |
| **Small Cactus**, **Big Cactus**, **Cactus Group**, **Bird** | one object each, with the same two short scripts: the object hides, waits until `next` is its number (1, 2, 3, 4), sets `next` back to 0 and makes a copy of itself; the copy starts at x = 20, slides left at `speed` and deletes itself. The Bird only makes a copy once `speed > 0.4`, and its copy flies at height 0, 1.3 or 2.6 |
| **Ground** | sets `speed` to `0.3 + timer ÷ 300` (capped at 0.65), scrolls left and jumps back every 32 squares, and adds `speed ÷ 2` to `score` every frame. Its second script picks `next` (a random 1–4) every 0.8–1.8 s, which is what decides which obstacle comes out and keeps two from coming out on top of each other |

The room (`dino.js`) owns only the stage: the sky, clouds, camera, sounds, high score and night mode.
It never moves the Dino, never ends the game and never decides a hit. If you cannot find a rule in the
blocks, it is not in the game.

## Things to try (also on the start card, in English and Spanish)

- **Moon jump:** on the Dino, make `set jump to 0.5` bigger.
- **Heavy gravity:** change `change jump by -0.03` to `-0.06`.
- **Fast start:** on the Ground, change the `0.3` in `set speed`.
- **Birds now:** on the Bird, change `speed > 0.4` to `speed > 0`.
- **Can't lose?** Take the `stop all` blocks out of the Dino.

Changes are kept in the browser (`localStorage`); **↺** puts the original game back. A browser only
stores the scripts once they differ from the originals, so an update to the game still reaches
students who never changed anything.

## Language, sound, touch

- **🌐 Español / English** switches the start card, buttons and messages, plus the editor's own
  buttons. Block words stay in English because they are the code, and key names stay as printed on the
  keyboard (`SPACE`, `↑`, `↓`). The choice is remembered per machine.
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
npm test        # 30 tests, no browser needed
npm run bump    # moves ?v= on every tag so caches cannot serve half a build
```

The tests read the three scripts block by block against the rules above, then **play the game
headless**: the real VM runs the real scripts with a stand-in renderer and a 60 Hz clock. A player who
jumps on time must survive two minutes to top speed, with all four obstacles coming out and never two
in the same place; one who does nothing, or jumps far too early or too late, must lose.

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
| **`dino.js`** | the room: the six objects and their scripts, the camera, HUD, sounds, saving, Spanish |
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

- **A fixed clock.** The VM runs each `forever` once per frame, so on a 120 Hz screen gravity would be
  twice as strong. The game is stepped at 60 per second whatever the screen does.
- **The camera frames a window of the world**, not the objects. With the editor open, that window is
  fitted into the gap between the block list and the script, so you can change a number, press SPACE
  and watch it without closing anything.

Every character is **one still picture**: no running legs, blinking or flapping. A costume only changes
when a block says `become a [...]` (ducking, and crashing), so everything on screen is something a
student can find in the code.

The art is drawn fresh for this game in the style of the original; it is not Google's sprite sheet.
