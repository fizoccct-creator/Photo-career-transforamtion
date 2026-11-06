# Screens and states

Design each screen in **landscape (1920 × 1080)** and **portrait (1080 × 1920)**. Name the Figma frames like the headings, for example `landscape-05-ar-lift`. The matching screenshot of the current app is in `reference/<orientation>/<same name>.png`.

`{Career}` = career title (longest: **Robotics Engineer**), `{emoji}` = its icon. The 23 careers are in `occupations.json`, the 4 categories in `categories.json`.

## Player flow (AR mode)

### 01-home
The attract screen while nobody is playing.
- Logo or brand name: "✨ Career Transformation"
- Title: **Who will you become?**
- Subtitle: "Choose a category, point at a career card, pull it down, and meet your future self."
- 4 steps: 🧍 "Stand in the frame" · 🗂️ "Choose a category" · ☝️ "Point at a card and pull it down" · 📸 "Smile for the camera"
- Main button: **▶ Start** (pulses)
- Small button: "🃏 Classic mode (no hand tracking)"
- Corner link (staff): "⚙️ Setup"
- Background: floating career icons, or `home-background`

### 02-ar-categories
Live camera full screen. The first page after Start.
- Top left: "✕ Home". Top right: "🃏 Classic mode"
- 4 category tiles in a row across the top: 💼 **Business** "4 careers" · ⚽ **Sports** "5 careers" · 🔬 **Science** "6 careers" · 🎨 **Creative** "8 careers". Each has its own colour (`categories.json`).
- Banner at the bottom centre (one line, changes):
  - "🧍 Stand in the frame to play"
  - "🚶 Step closer: we want you waist up"
  - "↩️ Step back a little: we want you waist up"
  - "🧍 Move into the frame in the middle"
  - "☝️ Point at a category to choose it"
  - "☝️ Point with one finger" (hand open instead of pointing)
  - "☝️ Opening Sports…" (while the finger is on a tile; a yellow bar fills along its bottom edge)
- Small status line under the banner: "Hand + head tracking ready ✋🙂" (also "Loading hand tracking…")
- Stand frame (dashed, subtle) with label "STAND HERE · WAIST UP" at its bottom and a dashed head-and-shoulders outline
- Someone in the frame becomes the player: the stand frame turns solid (faint yellow), the outline disappears, a "PLAYER" label sits above a rounded outline around their face, and a finger cursor (small glowing circle) follows their fingertip. Only one cursor is ever on screen.

### 03-ar-cards
Inside a category.
- Top bar: "✕ Home" · tabs **← Categories** · 💼 Business · ⚽ Sports · 🔬 Science · 🎨 Creative (the open one is yellow) · "🃏 Classic mode". Portrait: the tabs go on a second row under the buttons.
- That category's career cards in a row under the tabs, floating in 3D (up to 8 per row in landscape, 4 in portrait). Longest title: **Basketball Player** / **Robotics Engineer**
- Banner: "☝️ Point at a card to pick it up", or "☝️ Switching to Science…" / "☝️ Going back to the categories…" while a tab is being pressed

### 04-ar-picking
Finger is on a card (0.6 s).
- That card lifts and glows; a yellow progress outline runs around it
- Banner: "☝️ Picking up {Career}…"

### 05-ar-pull
The card sticks to the finger and follows it.
- Card bigger, tilted, following the finger
- Dashed line across the screen below the cards, label "⬇ Pull the card down below this line" (under the line)
- **✕ Cancel** button (red pill) just under the cards, to the right of the stand frame. Pointing at it puts the card back: "✕ Putting {Career} back…"
- Banner: "⬇ Pull {emoji} {Career} down below the line to choose it"; when the hand opens: "✋ Letting go of {Career}…"

### 06-ar-confirm
The card is below the line (0.8 s).
- Line turns solid yellow; progress outline runs around the card
- Banner: "✨ Keep {Career} down there…"

### 07-ar-chosen
- The card spins to the centre, large; other cards fade
- Banner: "🎉 Future {Career}! Lower your hand and get ready…"
- **✕ Cancel** stays until the photo is taken

### 08-ar-countdown
- Card moves to the bottom-right corner, small
- Big countdown number in the centre: 5, 4, 3, 2, 1 (pops in)
- Banner: "😄 Smile!"
- **✕ Cancel** (stops the countdown, back to the cards: "↩️ Cancelled. Point at another card")
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
- Category tabs: 💼 Business · ⚽ Sports · 🔬 Science · 🎨 Creative (open one in yellow)
- Grid of that category's career cards (click to flip and choose)
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
