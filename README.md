# TraffiCure Hero

Route-aware halftone map hero. Open `index.html` directly in a browser
(double-click works — no server required), or use VS Code Live Server
for auto-reload while editing.

## Structure
```
trafficcure-hero/
├── index.html          # markup: nav, headline, badge, CTAs, status bar
├── css/
│   └── style.css       # all styling + palette (CSS variables at top)
├── js/
│   ├── main.js         # WebGL shader + all interaction logic
│   └── map-data.js     # AUTO-GENERATED map texture (don't hand-edit)
├── assets/
│   └── map-routes.png  # the raw 3-channel texture, for reference
└── README.md
```

## Where to tune things (all in js/main.js)
| What                       | Where                                   |
|----------------------------|-----------------------------------------|
| Dot density                | `CELL = 9 * DPR` (higher = sparser)     |
| Palette                    | `COL_BG / COL_DOT / COL_DOT_HI`         |
| Traffic colors + labels    | `TRAFFIC` object                        |
| Dot breathing              | `breathe` line in shader: `0.32` amp, `mix(3.0, 6.5, …)` speed |
| Hover swarm radius         | `reach = u_res.x * 0.16`                |
| Idle blob strength         | `idleAmp = mix(0.62, 0.20, …)`          |
| Route ignition speed       | `* 2.4 * DPR` in the render loop        |

Copy (headline, paragraph, buttons, nav) lives in `index.html`.
Colors/typography/layout live in `css/style.css` (`:root` variables on top).

## Swapping the city map
`js/map-data.js` is generated from a traffic-map screenshot via an offline
pipeline (color classification -> route components -> 3-channel PNG -> base64).
To retarget a new city, send the new map screenshot back through that pipeline.
