# Run the AI on your own GPU (ComfyUI)

Use a PC with an NVIDIA graphics card (for example an RTX 4060 with 8 GB) instead of a paid AI service. Photos stay on your network and there is no cost per photo.

The booth server sends the selfie to ComfyUI on the GPU PC, waits for the picture, and shows it as usual. The booth server can run on the GPU PC itself or on another computer on the same network.

## 1. Set up ComfyUI on the GPU PC

1. Install ComfyUI from https://github.com/comfyanonymous/ComfyUI. The Windows "portable" download is the easiest.
2. Download an SDXL model and put it in `ComfyUI/models/checkpoints/`. The standard one is `sd_xl_base_1.0.safetensors`. A photorealistic SDXL model from the community usually gives better portraits.
3. Start ComfyUI so other computers can reach it:
   ```bash
   python main.py --listen
   ```
   (Portable Windows version: add `--listen` to the line in `run_nvidia_gpu.bat`.) It runs on port 8188.
4. If the booth runs on another computer, allow port 8188 through the Windows firewall, and find the GPU PC's address (for example `192.168.1.50`).

## 2. Point the booth at it

In the booth's `.env`:

```bash
AI_PROVIDER=comfyui
COMFYUI_URL=http://192.168.1.50:8188
COMFYUI_WORKFLOW=comfyui-workflow.json
```

Then copy the starter workflow:

```bash
cp comfyui-workflow.example.json comfyui-workflow.json
```

If your model file has a different name, set `COMFYUI_CHECKPOINT=your-model.safetensors` (or change `ckpt_name` in the workflow). Restart the booth with `npm start`. Each photo prints how long ComfyUI took.

## The starter workflow

`comfyui-workflow.example.json` uses only ComfyUI's built-in nodes: it takes the selfie, resizes it, and repaints it in the career scene ("image to image").

- **`denoise`** (in the KSampler node, default `0.6`) is the main dial. Lower (0.45) keeps more of the real face but changes the outfit less. Higher (0.75) changes more but the person looks less like themselves.
- **`steps`** (default 25): fewer is faster, more is cleaner.

This is a starting point. To keep faces much more recognisable, use a face-identity add-on (next section).

## Better faces: InstantID or PuLID

1. In ComfyUI, install **ComfyUI Manager**, then use it to install **ComfyUI_InstantID** (or **PuLID**). Follow that add-on's instructions for the extra model files it needs.
2. Build or load an InstantID workflow in ComfyUI and check that it works there with your own photo.
3. Prepare it for the booth:
   - In the positive prompt box, type exactly `{{PROMPT}}`. The booth replaces it with the career description.
   - Give the selfie's **Load Image** node the title `selfie` (right-click → Title). If there's only one Load Image node, this is optional.
   - Make sure it ends in a **Save Image** node.
4. Save it with **Workflow → Export (API)** as `comfyui-workflow.json` in the booth folder.

Note: InstantID's face-detection files and FLUX Kontext "dev" are licensed for non-commercial use only. Check the licences before using them at paid events.

## What the booth fills in automatically

| In the workflow | Becomes |
|---|---|
| `{{PROMPT}}` (anywhere) | The career prompt from `occupations.json` |
| The Load Image node titled `selfie` (or the first Load Image) | The player's photo |
| `width` / `height` of Upscale Image and Empty Latent Image nodes | 896×1152 (vertical screen) or 1152×896 (horizontal) |
| `seed` / `noise_seed` | A new random number for every photo |

## Troubleshooting

- **"Cannot reach ComfyUI"**: ComfyUI isn't running, wasn't started with `--listen`, the address in `COMFYUI_URL` is wrong, or the firewall blocks port 8188. Open `COMFYUI_URL` in a browser on the booth computer to check.
- **"ComfyUI error 400 … ckpt_name"**: the model file name in the workflow doesn't match a file in `models/checkpoints/`. Set `COMFYUI_CHECKPOINT`.
- **"took longer than 180 seconds"**: the first photo after starting ComfyUI is slow while it loads the model. Run one test photo before players arrive, or raise `COMFYUI_TIMEOUT_SECONDS`.
- **Out of memory on 8 GB cards**: lower the size, or start ComfyUI with `--lowvram`.
