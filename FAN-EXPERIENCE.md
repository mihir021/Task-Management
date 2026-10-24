# Thread City

An unofficial, browser-only Spider-Man fan experience at `/`. The existing MIHIR
Workspace remains at `/workspace`, with its password protection and API unchanged.
The fan experience uses React 19 (the existing project version), Vite, TypeScript,
Tailwind, GSAP/ScrollTrigger, Lenis, Zustand and original Canvas 2D effects. There
are no fan-page API calls, external audio files, copyrighted character drawings,
analytics, email subscriptions or account requirements.

## Run

Use Node 22 and npm:

```bash
npm ci
npm run fan
```

Open the printed loopback URL, normally http://127.0.0.1:43125. This runs the fan
page without a backend. The Workspace link needs the full application server:

```bash
npm start
```

Use the existing workspace environment configuration for cloud storage and its
password gate. No backend or environment variables are required for the fan page.
Do not copy real environment files or credentials into a public repository.

## Build and deploy

```bash
npm run lint
npm run build
```

Vercel uses the existing `vercel.json` SPA rewrites and `npm run vercel-build`.
Both `/` and `/workspace` load directly. Preserve existing server environment
settings for the workspace. To deploy this checkout with the Vercel CLI after
linking your own project, run `vercel --prod`, or push to its connected Git branch.

## Controls

- Classic / Noir / 2099: localStorage colour themes with a radial web transition.
- FX Full / Lite / Off: explicit effects control. Mobile, low-core and low-memory
  devices default to Lite. Reduced-motion preference disables physics, flashing,
  tilt and smooth scrolling regardless of the chosen level.
- Sound starts off on every visit. Toggle it on explicitly. All sound is generated
  using Web Audio; no copyrighted recordings are shipped.
- Click or tap for a web shot. Fine pointers on Full receive the reticle and trail.
- Hold S outside form fields for spider-sense. Approach a card quickly or enter the
  rogues section to trigger it. Random triggers occur every 20–30 seconds. The
  cooldown permits fewer than one pulse per second. The headline glitch is 150 ms.
- Drag/swipe the suit gallery, use its arrow buttons, or focus it and use arrow keys.
- The game supports mouse/touch targets, Enter to tag the nearest target, and Space
  for slow motion. Its clock pauses off-screen or when the browser tab is hidden.
- The high score is stored only in this browser. The quiz is five questions and
  produces an original archetype. The newsletter form is explicitly a demonstration;
  it sends nothing and creates no subscription.

## Assets

See `public/assets/README.md` for all 13 labelled image slots and replacement sizes.
The shipped placeholders are grids and circles only. Supply your own or licensed
artwork, replace the image files, then update the slot captions and alternative text.
The original line-art spider is not a character silhouette, mask or Marvel emblem.

## Tuning and structure

`src/fan/config.ts` holds effect counts, timings, speeds, quality budgets and theme
colours. Full hero physics uses 108 nodes; Lite uses 48. Device pixel ratio is capped
at two. Canvases use requestAnimationFrame and IntersectionObserver; hidden tabs stop
rendering, and decorative effects never capture pointer events. Workspace code is
lazy-loaded separately, so its large bundle is not downloaded for the fan homepage.

```text
src/
  App.tsx                  Public homepage / authenticated workspace route selection
  Workspace.tsx            Lazy-loaded existing workspace and password gate
  fan/
    FanExperience.tsx      Page sections, themes, sense, Lenis and GSAP lifecycle
    Effects.tsx            Loader, click web shots, reticle, web physics, skyline, spider
    Game.tsx               Web Slinger target game and local high score
    Quiz.tsx               Accessible five-question archetype quiz
    config.ts              Shared effect parameters and colour palettes
    content.ts             Original powers, moods, lab and rogue dossiers
    sound.ts               Synthesized thwip and sense sounds
    store.ts               Zustand preferences (sound always resets to off)
    useMotion.ts           Live reduced-motion preference
    fan.css                Comic-noir layout, themes and responsive/reduced-motion rules
public/assets/
  README.md
  hero.png
  suit-01.jpg ... suit-06.jpg
  rogue-01.jpg ... rogue-06.jpg
```

The full source archive includes this file and the project's complete runnable code,
package lock, Vercel configuration and placeholder plates. It excludes installed
packages, Git history, databases, run logs, uploads, environment secrets and builds.

## Verification limits

Lighthouse scores depend on the deployment, browser and test conditions. This project
has not been certified to a particular Lighthouse score; do not claim 90+ without
running an actual audit. Before replacing plates, keep hero artwork below 250 KB and
individual gallery images below 100 KB. Measure again after adding licensed art.

## Attribution

Unofficial fan project. Spider-Man and related characters are trademarks of Marvel.
Not affiliated or endorsed. All page copy and abstract graphics are original; the
rogue dossiers and quiz archetypes are explicitly non-canonical fiction.
