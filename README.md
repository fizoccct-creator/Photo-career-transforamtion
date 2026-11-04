# ✨ Career Transformation

Pick a career card → take a selfie → AI turns you into that occupation → download the photo.

## Run it

```bash
cd career-transformation
cp .env.example .env     # then edit .env
npm start                # http://localhost:3000
```

Run `npm install` once (it installs the QR code library). Needs Node 20.12+.

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

After Start, the webcam fills the whole screen and the career cards float in 3D along the bottom. They tilt toward your finger and turn as you move your head, so you can look around them. Timings and the effect strength are at the top of `public/ar.js`.

- **Point** your index finger at a card to hover it, or **pinch** (thumb + index finger) to pick it up and carry it.
- **Hold for 3 seconds.** A progress line runs around the card. Letting go or moving away resets it.
- The card is chosen, you get a moment to lower your hand, then a **5-second countdown** takes the photo and the AI transforms it.
- The mouse works as a stand-in hand (move = point, press and hold = pinch).
- "Use classic mode" switches to the click-a-card version.

Hand tracking uses Google MediaPipe in the browser, loaded from a CDN, so the device needs internet access. Settings like the hold time (`HOLD_MS`) are at the top of `public/ar.js`.

## Choose the AI

Set `AI_PROVIDER` in `.env` (currently `openai`). Get a key at https://platform.openai.com/api-keys.

| Value    | What it does                                           | Key needed        |
|----------|--------------------------------------------------------|-------------------|
| `openai` | OpenAI image edits (`gpt-image-2.5-sunburst`, default) | `OPENAI_API_KEY`  |
| `demo`   | Returns your own photo in the career frame (test flow) | none              |
| `gemini` | Google Gemini image editing (`gemini-3.1-flash-image`) | `GEMINI_API_KEY`  |

API keys stay on the server; the browser never sees them. Run `npm run models` to list the image models your key can use, then set `OPENAI_MODEL` / `GEMINI_MODEL` in `.env`.

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

- `server.js`: web server and AI provider calls (`/api/occupations`, `/api/transform`)
- `occupations.json`: the career cards
- `public/ar.js`: AR mode (hand tracking, pick up and hold a card, countdown photo)
- `public/app.js`: screens, classic mode, transformation and download
- `share.js`: QR download (stores photos locally or in online storage)
- `public/frame.js`: draws the downloaded photo from the brand template
- `design/`: your artwork and template.json

## Notes

- Camera access works on `localhost` or HTTPS only. To use it on a phone or kiosk over the network, serve it behind HTTPS.
- Photos are sent to the chosen AI provider and are not stored by this server.
