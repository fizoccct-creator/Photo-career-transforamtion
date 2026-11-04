# QR download

After the photo is made, the result screen shows a QR code. Players scan it with their phone camera and get a page with their framed photo and a **Download** button.

There are two ways to store the photos. Set `SHARE_STORAGE` in `.env`:

| Setting                 | Works on                                 | Needs                          |
|-------------------------|------------------------------------------|--------------------------------|
| `local` (current)       | phones on the **same Wi-Fi** as the kiosk | nothing                        |
| `s3` (internet)         | **any phone**, Wi-Fi or mobile data       | an online storage account      |

In both modes, each link has a long random code that can't be guessed. Photos are deleted after `SHARE_TTL_HOURS` (24 by default).

## Setting up online storage with Cloudflare R2 (recommended)

R2 has a free tier of 10 GB, which is tens of thousands of photos, and it charges nothing for downloads. Cloudflare may ask for a payment card when you turn R2 on, even if you stay within the free tier. Cloudflare's dashboard changes over time, so menu names may differ slightly.

1. **Create a Cloudflare account** at https://dash.cloudflare.com and open **R2 Object Storage**.
2. **Create a bucket**, for example `career-photos`.
3. **Make it publicly readable:** in the bucket's **Settings**, either:
   - connect a **custom domain** such as `photos.yourcompany.com` (best for events), or
   - turn on the **r2.dev public URL** (fine for testing, but Cloudflare rate-limits it).

   Copy that address into `S3_PUBLIC_URL`, e.g. `https://photos.yourcompany.com`.
4. **Auto-delete old photos:** in the bucket's **Settings → Object lifecycle rules**, add a rule for prefix `p/` that deletes objects **after 1 day**. This is what removes photos in online mode.
5. **Create an API token:** go to **R2 → Manage API tokens → Create API token**, give it **Object Read & Write** permission on this bucket only, then copy:
   - **Access Key ID** → `S3_ACCESS_KEY_ID`
   - **Secret Access Key** → `S3_SECRET_ACCESS_KEY` (shown only once)
   - the **S3 endpoint**, which looks like `https://<account-id>.r2.cloudflarestorage.com` → `S3_ENDPOINT`
6. **Fill in `.env`** yourself (don't share these keys in chat or email):

   ```
   SHARE_STORAGE=s3
   S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=career-photos
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_PUBLIC_URL=https://photos.yourcompany.com
   ```

7. **Restart the app** (`npm start`). The startup line should say `QR sharing: s3`.

### Amazon S3 or Backblaze B2 instead

The same settings work with any S3-compatible storage:
- **Amazon S3:** `S3_ENDPOINT=https://s3.<region>.amazonaws.com` and `S3_REGION=<region>`. Allow public reads on the `p/` folder and add a 1-day lifecycle rule.
- **Backblaze B2:** use the bucket's S3 endpoint and region.

## Notes

- **Kiosk needs internet** in online mode, because the photo is uploaded the moment the result appears.
- **Local mode on Windows:** the first time, Windows may ask to allow Node.js through the firewall. Allow it on **private networks**, or phones won't be able to connect.
- If the QR panel shows an error, the message tells you which setting is missing or wrong.
