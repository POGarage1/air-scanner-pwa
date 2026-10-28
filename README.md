# Air Scanner PWA

A mobile-first barcode scanner UI for airport workflows. It is intended to decode **PDF417** and **ITF (Interleaved 2 of 5)** using Rxing WebAssembly, with no product database, admin screen, or scan upload.

## Features

- Rear-camera capture via `getUserMedia()`
- Rxing WebAssembly decoding
- Targeted format hint for PDF417 and ITF
- Torch toggle when supported by the browser/device
- Latest decoded value, format label, timestamp, copy button
- Installable PWA shell and basic service worker
- Stops camera when the page is hidden

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open the URL shown by Vite. Camera access generally requires **HTTPS** or `localhost`.

Build for production:

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. In GitHub, open **Settings → Pages** and select **GitHub Actions** (or configure a static deployment workflow).
3. If deploying under a repository subpath, set Vite's `base` in `vite.config.js` to `'/REPOSITORY-NAME/'` before building.
4. Use the HTTPS Pages URL to grant camera permission and test on the actual iPhone.

For Cloudflare Pages or a root-domain deployment, the default Vite base is usually suitable.

## Rxing WASM

This project uses the published `rxing-wasm` package. Upstream documents `convert_canvas_to_luma`, `decode_multi`, `DecodeHintDictionary`, and `DecodeHintTypes`. The browser code passes `pdf417,itf` as the `PossibleFormats` hint and filters returned results to these two formats.

**Important:** Verify the actual npm package export/API against the version installed by `npm install`. Rxing-Wasm's JavaScript API has changed across versions. Run `npm run build` and test with real examples of both barcode types on the target iPhone before operational use. Do not treat a successful decode alone as validation for operational/aviation decisions.

## Notes

- The web app does not send camera frames or decoded values to a server.
- Torch support varies by iPhone model, iOS version, and browser. Safari may not expose torch control even if the physical flash exists.
- PWA/service-worker caching does not make camera access available offline in every browser context; deploy over HTTPS.
- The camera is requested only after the user taps **Bắt đầu quét**.
- No Supabase, product lookup, manual product search, admin page, or persistent scan history is included.
