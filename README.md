# ✨ Career Transformation

Pick a career card → take a selfie → AI turns you into that occupation → download the photo.

## Run it

**No coding tools:** install Node.js, then double-click `Start Booth (Windows).bat` or `Start Booth (Mac).command`. The browser opens the booth, and the first time it opens the Setup page for your API key. See [`HOW-TO-RUN.md`](HOW-TO-RUN.md).

**From a terminal:**

```bash
npm install      # once (installs the QR code library)
npm start        # http://localhost:3000
```

Needs Node 20.12+. On the first start `.env` is created from `.env.example`.

## Put it online with Vercel

Vercel runs `server.js` as is, but a Vercel server can't save files. So there is no `.env` file and no Setup page there (the Setup page is switched off online, so nobody on the internet can change your key). Add the settings in your Vercel project instead:

1. Open the project on vercel.com → **Settings → Environment Variables**.
2. Add these, then **redeploy** (Deployments → ⋯ → Redeploy), because changes only apply to new deployments:

   | Name | Value |
   |------|-------|
   | `AI_PROVIDER` | `openai` (or `gemini`, or `demo` to test without AI) |
   | `OPENAI_API_KEY` | your key (`GEMINI_API_KEY` for Gemini) |
   | `OPENAI_MODEL` | optional, default `gpt-image-2.5-sunburst` |
   | `SHARE_STORAGE` | `s3`, plus the `S3_…` settings from [`SHARING.md`](SHARING.md) |

   QR downloads need online storage on Vercel: "local" sharing saves photos on the computer, which Vercel can't do. Without it, everything else works and the QR panel says what's missing.

Other things to know:

- On Vercel the AI photo comes back as a JPEG, because Vercel answers at most 4.5 MB at a time.
- A photo can take up to a minute to make. Vercel's free plan allows 5 minutes per request, so that's fine.
- The page must be opened over `https://` (Vercel does that), or the browser won't allow the camera.
- If a page still shows an error, open the deployment on vercel.com → **Logs**: the booth writes what went wrong there.

## QR download

The result screen shows a QR code so players can download their photo on their phone. It works on the same Wi-Fi out of the box. For any phone over the internet, set up online storage: see [`SHARING.md`](SHARING.md).

## Your designs

Put your artwork (career cards, photo frames, logo, backgrounds) in the [`design/`](design/) folder. Files are picked up by name. See [`design/README.md`](design/README.md).

## Home screen

The app opens on a home screen. Players press **▶ Start** when they're ready. The app goes full screen and opens the camera. After the photo, **👋 Next player** returns to the home screen.

## Vertical or horizontal screens

Everything adapts to the screen shape, so a portrait kiosk or monitor works as well as a landscape TV or laptop:

| Screen     | Card layout                | Photo sent to AI | AI output size |
|------------|----------------------------|------------------|----------------|
| Horizontal | rows of 8 along the top, under the category tabs | 4:3 | 1536×1024 |
| Vertical   | rows of 4 along the top, under the category tabs | 3:4 | 1024×1536 |

## AR mode

After Start, the webcam fills the whole screen. The first page shows the **career categories** (Business, Sports, Science, Creative). Point at one to open it: only that category's career cards are shown, floating in 3D along the top of the screen. The tabs at the top switch to another category, and **← Categories** goes back. The cards tilt toward your finger and turn as you move your head, so you can look around them.

- **Stand in the frame, waist up.** A dashed frame in the middle of the screen marks where to stand, with a head-and-shoulders outline for a medium shot (waist up in the photo). Only someone inside it, at medium-shot distance, can play. The banner tells people to step closer, step back or move into the frame.
- **One player at a time.** The closest face in the frame becomes the player and gets a "Player" outline. Only that person's hand works; other people's hands are ignored.
- **Point with one finger.** Only a pointing hand (index finger out, the others folded) shows a cursor, and there is only ever one cursor on screen. An open hand does nothing, so waving doesn't pick cards by accident.
- **Point** at a card for a moment. A progress line runs around it, then the card sticks to your finger.
- **Pull it down** below the line and keep it there for a moment to choose it. A card that stays up in the card area is never chosen. Open your hand (or move it out of the camera) to let go: the card goes back.
- **✕ Cancel** appears while you hold a card and during the countdown. Point at it (or click it) to put the card back or stop the countdown.
- Buttons (categories, tabs, Cancel) are pressed by pointing at them until the yellow bar fills up.
- The card is chosen, you get a moment to lower your hand, then a **5-second countdown** takes the photo and the AI transforms it.
- The mouse works as a stand-in finger (move = point) when no hand is pointing.
- "Use classic mode" switches to the click-a-card version.

Hand tracking uses Google MediaPipe in the browser, loaded from a CDN, so the device needs internet access. Settings like the pick-up time (`GRAB_MS`), the button press time (`PRESS_MS`), the pull-down time (`CONFIRM_MS`), the one-finger rule (`POINT_ONLY`), the stand zone size (`ZONE_WIDTH`) and the medium-shot distance (`SHOT_MIN`, `SHOT_MAX`) are at the top of `public/ar.js`. Tip: once you find the spot where someone is waist up in the photo, mark it with a floor sticker.

## Choose the AI

Choose the AI and paste the API key on the **⚙️ Setup** page (`http://localhost:3000/setup.html`, also linked from the home screen). It saves them to `.env`, or you can edit `.env` yourself (`AI_PROVIDER`, `OPENAI_API_KEY`). Get a key at https://platform.openai.com/api-keys.

| Value    | What it does                                           | Key needed        |
|----------|--------------------------------------------------------|-------------------|
| `openai` | OpenAI image edits (`gpt-image-2.5-sunburst`, default) | `OPENAI_API_KEY`  |
| `demo`   | Returns your own photo in the career frame (test flow) | none              |
| `gemini` | Google Gemini image editing (`gemini-3.1-flash-image`) | `GEMINI_API_KEY`  |

API keys stay on the server; the browser never sees them, and the Setup page only works on the booth computer itself (not from phones on the Wi-Fi). Run `npm run models` to list the image models your key can use, then set `OPENAI_MODEL` / `GEMINI_MODEL` in `.env`.

## Add more careers

Add an entry to [`occupations.json`](occupations.json). No code changes needed:

```json
{
  "id": "chef",
  "title": "Chef",
  "emoji": "👨‍🍳",
  "color": "#ea580c",
  "tagline": "Cook up something amazing",
  "category": "creative",
  "prompt": "a professional head chef wearing a white double-breasted chef jacket and tall toque, in a busy stainless-steel restaurant kitchen"
}
```

`prompt` describes the outfit and scene; the server adds instructions to keep the person's face recognisable. `category` is the id of one of the categories in [`categories.json`](categories.json) (`business`, `sports`, `science`, `creative`). To move a career to another category, change that one word. Add a category by adding an entry to `categories.json`; a category with no careers is not shown.

There are 23 careers now:

| Category | Careers |
|----------|---------|
| 💼 Business | CEO, Entrepreneur, Lawyer, Banker |
| ⚽ Sports | Football Player, Basketball Player, Badminton Player, Racing Driver, Firefighter |
| 🔬 Science | Pilot, Doctor, Astronaut, Scientist, Robotics Engineer, Architect |
| 🎨 Creative | Photographer, Videographer, Graphic Designer, Film Director, News Anchor, Music Producer, Fashion Designer, Chef |

## Files

- `server.js`: web server, AI provider calls (`/api/occupations`, `/api/transform`) and the Setup page API (`/api/settings`)
- `public/setup.html`: Setup page (AI choice and API key)
- `Start Booth (Windows).bat`, `Start Booth (Mac).command`: double-click launchers
- `occupations.json`: the career cards
- `categories.json`: the career categories (first page after Start)
- `public/ar.js`: AR mode (categories, stand zone, one-player lock, one-finger pointing, pull a card down, cancel, countdown photo)
- `public/app.js`: screens, classic mode, transformation and download
- `share.js`: QR download (stores photos locally or in online storage)
- `public/frame.js`: draws the downloaded photo from the brand template
- `design/`: your artwork and template.json

## Notes

- Camera access works on `localhost` or HTTPS only. To use it on a phone or kiosk over the network, serve it behind HTTPS.
- Photos are sent to the chosen AI provider and are not stored by this server.
