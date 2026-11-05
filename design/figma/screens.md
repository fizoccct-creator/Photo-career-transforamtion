# Screens and states

Design each screen in **landscape (1920 × 1080)** and **portrait (1080 × 1920)**. Name the Figma frames like the headings, for example `landscape-05-ar-lift`. The matching screenshot of the current app is in `reference/<orientation>/<same name>.png`.

`{Career}` = career title (longest: **Robotics Engineer**), `{emoji}` = its icon. The 16 careers are in `occupations.json`.

## Player flow (AR mode)

### 01-home
The attract screen while nobody is playing.
- Logo or brand name: "✨ Career Transformation"
- Title: **Who will you become?**
- Subtitle: "Point at a career card, lift it up, and meet your future self."
- 3 steps: 🧍 "Stand in the frame" · ☝️ "Point at a card and lift it up" · 📸 "Smile for the camera"
- Main button: **▶ Start** (pulses)
- Small button: "🃏 Classic mode (no hand tracking)"
- Corner link (staff): "⚙️ Setup"
- Background: floating career icons, or `home-background`

### 02-ar-stand
Live camera full screen, nobody in the frame yet.
- Top left: "✕ Home". Top right: "🃏 Classic mode"
- Top centre banner (one line, changes):
  - "🧍 Stand in the frame to play"
  - "🚶 Step closer: we want you waist up"
  - "↩️ Step back a little: we want you waist up"
  - "🧍 Move into the frame in the middle"
- Small status line under the banner: "Hand + head tracking ready ✋🙂" (also "Loading hand tracking…")
- Stand frame (dashed, subtle) with label "STAND HERE · WAIST UP" and a dashed head-and-shoulders outline
- 16 career cards along the bottom (2 rows of 8 in landscape, 4 rows of 4 in portrait), floating in 3D. Longest title: **Robotics Engineer**

### 03-ar-player
Someone is in the frame and is now the player. (No reference screenshot: it needs a real face on camera. It looks like 02 with the changes below.)
- Stand frame turns solid (faint yellow), outline disappears
- "PLAYER" label above a rounded outline around the player's face
- Finger cursor: a small glowing circle on the fingertip
- Banner: "☝️ Point at a card to pick it up"

### 04-ar-picking
Finger is on a card (0.6 s).
- That card lifts and glows; a yellow progress outline runs around it
- Banner: "☝️ Picking up {Career}…"

### 05-ar-lift
The card sticks to the finger and follows it.
- Card bigger, tilted, following the finger
- Dashed line across the screen above the cards, label "⬆ Lift the card above this line"
- Banner: "⬆ Lift {emoji} {Career} up above the line to choose it"

### 06-ar-confirm
The card is above the line (0.8 s).
- Line turns solid yellow; progress outline runs around the card
- Banner: "✨ Keep {Career} up there…"

### 07-ar-chosen
- The card spins to the centre, large; other cards fade
- Banner: "🎉 Future {Career}! Lower your hand and get ready…"

### 08-ar-countdown
- Card moves to the bottom-right corner, small
- Big countdown number in the centre: 5, 4, 3, 2, 1 (pops in)
- Banner: "😄 Smile!"
- White flash when the photo is taken

### 09-loading
- Career icon, spinner
- Title rotates every 3 s: "Transforming you…", "Picking out your uniform…", "Setting up the scene…", "Adjusting the lighting…", "Adding the finishing touches…"
- Subtitle: "This usually takes 10–30 seconds."

### 10-result
- Title: **Meet the future {Career}!**
- The framed photo (your `frames/frame-*` artwork with the AI photo inside)
- QR panel: QR code, "📱 Scan to download", note "Connect your phone to the same Wi-Fi, then scan. Link works for 24 hours." (online storage: "Scan with your phone camera. Link works for 24 hours.")
- Buttons: **⬇ Download photo** · "⬇ Without frame" · "↺ Try another career" · "👋 Next player"

## Classic mode (no hand tracking)

### 11-classic-cards
- Title: **Who will you become?**
- Subtitle: "Pick a career card. Then take a selfie and AI turns you into that person."
- Grid of career cards (click to flip and choose)
- Buttons: "🎲 Surprise me" · "✋ Back to AR mode" · "⌂ Home"

### 12-classic-camera
- Title: "Strike a pose, future {Career}!"
- Subtitle: "Face the camera with good lighting. Your face should be clear and centred."
- Camera preview (rounded), countdown number over it
- Buttons: "← Change card" · **📸 Take photo** · "⬆ Upload photo". After the photo: "↺ Retake" · **✨ Transform me**

## Staff

### 13-setup
- "⚙️ Booth setup", "Choose the AI and paste your API key. It's saved on this computer only and never shown to players."
- Choice cards: OpenAI / Google Gemini / Demo mode
- API key field with "Show", saved hint "✓ Key saved (sk-…abcd)", "Model (advanced)"
- Buttons: "🔌 Test key" · **💾 Save** · "▶ Open the booth"
- Message box: green (success) or red (error)

## Messages on top of any screen

- **Error** (red, top centre, 12 s): "⚠️ Couldn't make your photo: {reason}. Please try again."
- **Staff note** (orange; top of home, under the buttons on result): "⚠️ Staff: the AI credit has run out, so photos are not transformed (players get their normal photo in the frame). Add credit at platform.openai.com → Settings → Billing."
- **No camera**: "📷 Waiting for camera…" and "Camera not available: allow camera access, or use classic mode"

## Artwork (exported as files, not rebuilt)

- Career cards: 750 × 1000 each
- Photo frame: portrait 1080 × 1920 and landscape 1920 × 1080
- Logo, home background

See the table in `README.md` for names and sizes.
