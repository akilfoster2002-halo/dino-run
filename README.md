# Dino Run — built out of blocks

The dinosaur runner game, and every rule of it is a block you can open and change.

Open the page and press **SPACE**. The Dino runs; jump the cactuses with **SPACE**, duck the bird
with **↓**. It gets faster the longer you last, turns to night at 700, and ends when you hit
something. Then press **C** (or **▦ BLOCKS**, or click the Dino, a cactus or the ground) and read the
blocks that just did all of that.

The scripts are kept as short as they can be and still be the game. There are six objects:

| | |
|---|---|
| **Dino** | `when space key pressed` → if `y position = 0`: glide up to y 6 in 0.35 s, glide back down to y 0. And forever: if ↓ is held, the ducking picture, otherwise the Dino |
| **Small Cactus**, **Big Cactus**, **Cactus Group**, **Bird** | the same two scripts each. The hidden original waits until `next` is its number (1, 2, 3, 4), sets `next` back to 0 and makes a copy of itself. The copy shows, slides left at `speed`, runs `stop all` if it touches the Dino, and deletes itself off the screen. The copy starts where the original waits (x = 20; the Bird at head height, y = 1.3), so it needs no `go to` |
| **Ground** | sets `speed` to 0.3 and `score` to 0, then forever: slides left, jumps back every 32 squares, adds 0.2 to `score` and 0.0001 to `speed`. Its second script sets `next` to a random 1–4 every 1–2.5 s, which decides which obstacle comes out and keeps two from coming out on top of each other |

The whole game is 112 blocks, and only three variables: `speed`, `score` and `next`.

The room (`dino.js`) owns only the stage: the sky, clouds, camera, sounds, high score and night mode.
It never moves the Dino, never ends the game and never decides a hit. If you cannot find a rule in the
blocks, it is not in the game.

## Things to try (also on the start card, in English and Spanish)

- **Moon jump:** on the Dino, change the `y 6` in the first `glide` to `9`.
- **Quick jump:** change the `0.35` in both `glide` blocks to `0.2`.
- **Fast start:** on the Ground, change `set speed to 0.3` to `0.6`.
- **Only birds:** on the Ground, change `pick random 1 to 4` to `4 to 4`.
- **Can't lose?** Take `stop all` out of the Bird. What happens?

Changes to the blocks last until the page is refreshed: every page load is the original game, and
**↺** puts the original back without refreshing. Only the high score, the language and the sound
setting are remembered by the browser.

## Language, sound, touch

- **🌐 Español / English** switches the start card, buttons and messages, plus the editor's own
  buttons. Block words stay in English because they are the code, and key names stay as printed on the
  keyboard (`SPACE`, `↓`). The choice is remembered per machine.
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

The tests read the three scripts block by block against the rules above, then **play the game
headless**: the real VM runs the real scripts with a stand-in renderer and a 60 Hz clock. A player who
jumps on time must survive two minutes, with all four obstacles coming out and never two in the same
place; one who does nothing, or jumps far too early or too late, must lose.

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

- **A fixed clock.** The VM runs each `forever` once per frame, so on a 120 Hz screen the cactuses,
  the ground and the speed-up would all run twice as fast. The game is stepped at 60 per second
  whatever the screen does.
- **The camera frames a window of the world**, not the objects. With the editor open, that window is
  fitted into the gap between the block list and the script, so you can change a number, press SPACE
  and watch it without closing anything.

Every character is **one still picture**: no running legs, blinking or flapping. A costume only changes
when a block says `become a [...]` (ducking, and crashing), so everything on screen is something a
student can find in the code.

The art is drawn fresh for this game in the style of the original; it is not Google's sprite sheet.
