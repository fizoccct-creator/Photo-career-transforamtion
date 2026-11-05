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
| Horizontal | one row along the bottom   | 4:3              | 1536×1024      |
| Vertical   | rows of 3 along the bottom | 3:4              | 1024×1536      |

## AR mode

After Start, the webcam fills the whole screen and the career cards float in 3D along the bottom. They tilt toward your finger and turn as you move your head, so you can look around them.

- **Stand in the frame, waist up.** A dashed frame in the middle of the screen marks where to stand, with a head-and-shoulders outline for a medium shot (waist up in the photo). Only someone inside it, at medium-shot distance, can play. The banner tells people to step closer, step back or move into the frame.
- **One player at a time.** The closest face in the frame becomes the player and gets a "Player" outline. Only that person's hand works; other people's hands are ignored.
- **Point** your index finger at a card for a moment. A progress line runs around it, then the card sticks to your finger.
- **Lift it up** above the line and keep it there for a moment to choose it. A card that stays in the bottom area is never chosen. If your hand leaves the camera, the card goes back.
- The card is chosen, you get a moment to lower your hand, then a **5-second countdown** takes the photo and the AI transforms it.
- The mouse works as a stand-in finger (move = point).
- "Use classic mode" switches to the click-a-card version.

Hand tracking uses Google MediaPipe in the browser, loaded from a CDN, so the device needs internet access. Settings like the pick-up time (`GRAB_MS`), the lift time (`CONFIRM_MS`), the stand zone size (`ZONE_WIDTH`) and the medium-shot distance (`SHOT_MIN`, `SHOT_MAX`) are at the top of `public/ar.js`. Tip: once you find the spot where someone is waist up in the photo, mark it with a floor sticker.

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
  "prompt": "a professional head chef wearing a white double-breasted chef jacket and tall toque, in a busy stainless-steel restaurant kitchen"
}
```

`prompt` describes the outfit and scene; the server adds instructions to keep the person's face recognisable.

## Files

- `server.js`: web server, AI provider calls (`/api/occupations`, `/api/transform`) and the Setup page API (`/api/settings`)
- `public/setup.html`: Setup page (AI choice and API key)
- `Start Booth (Windows).bat`, `Start Booth (Mac).command`: double-click launchers
- `occupations.json`: the career cards
- `public/ar.js`: AR mode (stand zone, one-player lock, point and lift a card, countdown photo)
- `public/app.js`: screens, classic mode, transformation and download
- `share.js`: QR download (stores photos locally or in online storage)
- `public/frame.js`: draws the downloaded photo from the brand template
- `design/`: your artwork and template.json

## Notes

- Camera access works on `localhost` or HTTPS only. To use it on a phone or kiosk over the network, serve it behind HTTPS.
- Photos are sent to the chosen AI provider and are not stored by this server.
