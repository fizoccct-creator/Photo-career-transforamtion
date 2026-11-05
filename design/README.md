# Design folder

Drop your artwork in here. The app finds each file by its **name**, so there's no code to change. Reload the app page after adding or replacing a file. PNG, JPG and WEBP all work.

Designing in Figma? Start with [`figma/README.md`](figma/README.md): screen list, colours and sizes, reference screenshots, and how to export straight into this folder.

```
design/
├── logo.png                    optional: your logo (transparent PNG), shown on the home screen and photos
├── home-background.jpg         optional: full-screen image behind the home screen
├── template.json               colours, fonts and positions (photo window, logo box, texts)
│
├── cards/                      career cards (one image per career)
│   ├── guide-card.svg            ← size guide: 750 × 1000 px (3:4)
│   ├── pilot.png
│   ├── doctor.png
│   ├── photographer.png
│   ├── videographer.png
│   └── graphic-designer.png
│
└── frames/                     the downloaded photo
    ├── guide-portrait.svg        ← layout guide, vertical 1080 × 1920
    ├── guide-landscape.svg       ← layout guide, horizontal 1920 × 1080
    ├── frame-portrait.png        optional overlay with a transparent photo window
    ├── frame-landscape.png
    ├── background-portrait.png   optional: sits behind the photo
    └── background-landscape.png
```

Anything you leave out falls back to the built-in design in the company colours.

## Cards

- One image per career, named after the `id` in `occupations.json`, for example `pilot.png`.
- Size **750 × 1000 px (3:4)**. Keep text and icons inside the safe area on `guide-card.svg`. The app rounds the corners.
- The design is the whole card. The app adds only the hover glow, the pick-up and lift progress outline and the 3D tilt.
- A career with no image uses the built-in card (emoji and name).
- New career? Add it to `occupations.json`, then add `design/cards/<id>.png`.

## Photo frame (what players download)

Layers, bottom to top: **background → AI photo → frame overlay → logo → texts**.

1. Open `frames/guide-portrait.svg` (or the landscape one) in Canva, Illustrator or Photoshop as your bottom layer.
2. Design over it. Keep the pink **photo area transparent**.
3. Hide the guide and export a **transparent PNG** at the same size as `frame-portrait.png` / `frame-landscape.png`.
4. Optionally add a `background-portrait.png` for anything that should sit behind the photo.

The career name and date are drawn by the app, so they change per player. Their positions, sizes and colours are the `texts` in `template.json`. To design that text into your artwork yourself, remove those lines.

To move the photo window or logo box, edit `photo` / `logo` in `template.json`, then run `npm run guides` to redraw the guide SVGs.

## Colours

`template.json` → `colors`: primary `#FDD00D` (yellow), secondary `#202959` (blue), light `#FFFFFF`, dark `#000000`. These colour the whole app as well as the built-in card and frame designs.
