# Designing the booth in Figma

**The Figma file:** [Photo booth design](https://www.figma.com/design/38RCn5j3jSBumrnglgP4LD/Photo-booth-design). It's already set up: colour variables, text styles, components, all screens in landscape and portrait, and export-ready artwork. Edit it there, then ask Claude to update the booth to match.

This folder has everything you need to design the booth in Figma, and to bring the design back into the app.

```
design/figma/
├── README.md          this guide
├── screens.md         every screen and state, what's on it, and all its text
├── tokens.json        colours, fonts, sizes and corners (import as Figma variables)
├── reference/         screenshots of the current app, to start from
│   ├── landscape/       1920 × 1080 (TV, laptop)
│   └── portrait/        1080 × 1920 (vertical kiosk screen)
└── handoff/           put your finished exports here for Claude to build from
```

There are two kinds of design. They come back into the app in different ways.

| What | Examples | How it gets into the app |
|------|----------|--------------------------|
| **Artwork** | career cards, photo frame, logo, home background | Export from Figma straight into `design/`. The app uses the image files as they are. |
| **Screens** | home, camera / AR, loading, result, setup | A mockup. Claude rebuilds it in the app's code (HTML/CSS) so it stays live and interactive. |

## 1. Set up the Figma file

Create one Figma file, for example **Career Transformation booth**, with these pages:

1. **Foundations**: colours, text styles, buttons, banner, card, badges.
2. **Screens: landscape**: one frame per screen, **1920 × 1080**.
3. **Screens: portrait**: one frame per screen, **1080 × 1920**.
4. **Artwork (export)**: cards, frames, logo and background, at their exact export sizes (see section 4).

## 2. Bring in the starting points

- **Current screens:** drag the PNGs from `reference/landscape/` and `reference/portrait/` into the screen pages. Lock them as a bottom layer, or redesign from scratch next to them.
- **Layout guides:** drag `design/cards/guide-card.svg`, `design/frames/guide-portrait.svg` and `design/frames/guide-landscape.svg` into the Artwork page. Figma opens SVGs as editable layers. They show the safe areas and where the photo goes.
- **Colours and sizes:** import `tokens.json` as variables. Use Figma's variables import if your plan has it, or the free **Tokens Studio** plugin. You can also type the few colours in by hand; they're listed in section 5.

## 3. Rules for the screens

The app has to work live, so a few things are fixed:

- **The camera fills the AR screen.** Use a photo of a person standing waist up as a placeholder for the live camera image. Design the parts *on top*: banner, buttons, cards, stand frame and lift line.
- **The cards live in the bottom third** (about 32 % of the height). Landscape has one row of 5. Portrait has rows of 3 (3 + 2). Keep the middle of the screen clear: that's where the player's face and body are.
- **The stand frame** is in the middle: 42 % of the width in landscape, 60 % in portrait. It runs from near the top down to the cards. Keep it subtle, because it sits over the camera image.
- **Texts change while playing.** Design the longest version (see `screens.md`), for example "⬆ Lift ✈️ Graphic Designer up above the line to choose it".
- **Touch and distance:** players stand about 1–2 m from the screen. Use big text and big targets; buttons at least 64 px tall at 1920 × 1080.
- **Fonts:** the app uses the computer's system font (Segoe UI on Windows). To use a different font, choose one you're allowed to embed (Google Fonts are free) and put the font files (`.woff2`) in `design/fonts/`.
- **Emoji** in the current design are placeholders. You can replace them with your own icons; export those as SVG.

## 4. Artwork: name it, export it, drop it in

Name each artwork frame **with its path**. Figma turns `/` into folders when exporting, so the files land in the right place:

| Figma frame name | Size (px) | Export as |
|------------------|-----------|-----------|
| `cards/pilot` (one per career: `doctor`, `photographer`, `videographer`, `graphic-designer`) | 750 × 1000 | PNG |
| `frames/frame-portrait` | 1080 × 1920 | PNG, transparent photo window |
| `frames/frame-landscape` | 1920 × 1080 | PNG, transparent photo window |
| `frames/background-portrait` / `frames/background-landscape` (optional) | same as the frames | PNG or JPG |
| `logo` | about 1000 × 300, transparent | PNG |
| `home-background` (optional) | 1920 × 1080 (or 1080 × 1920 for a vertical kiosk) | JPG |

To export: select the frames, then in the right panel **Export → PNG, 1x**, then **Export**. Copy the exported folders into `design/` and reload the booth. More detail on cards and frames is in [`../README.md`](../README.md).

Card and career IDs come from `occupations.json`. A new career needs an entry there and a `cards/<id>` image.

## 5. Brand basics

| Token | Value | Used for |
|-------|-------|----------|
| primary | `#FDD00D` (yellow) | Start button, highlights, card borders, progress outline |
| secondary | `#202959` (blue) | backgrounds, banner, buttons |
| light | `#FFFFFF` | text |
| dark | `#000000` | shadows, camera background |
| radius | 18 px (panels), 99 px (pill buttons and banner) | corners |

Change brand colours in `design/template.json` too: the app reads them from there.

## 6. Hand the design back

When a screen is ready, either:

- **Share the Figma link** with Claude. Claude can read the file directly once the Figma connector is connected. In Claude Code, run `/mcp` and sign in to Figma. Or,
- **Export each screen frame as PNG** (2x is best) into `handoff/`, named like the screens in `screens.md` (for example `landscape-03-ar-lift.png`). Add any notes (spacing, animations, hover states) in `handoff/notes.md`.

Then ask Claude to "build the screens in `design/figma/handoff`". Artwork you exported into `design/` works right away.
