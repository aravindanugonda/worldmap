# True Country Size Explorer

An interactive world map UI for **true country size comparison**.

## What changed to make size comparison more accurate

This app now uses a **Mercator base map + latitude-corrected draggable overlays**.

- Mercator is kept as the reference map because it is familiar.
- When you drag an overlay north/south, its size is automatically scaled by a Mercator correction factor.
- This compensates for the latitude distortion that makes high-latitude countries look larger than they are.

That means comparisons like Africa vs Russia are much closer to real-world proportions when you drag overlays to the same latitude.

## Features

- Click/select a country to create a draggable overlay.
- Drag overlays across the map; overlay size auto-corrects with latitude.
- Create multiple overlays for direct side-by-side comparisons.
- Country details include true area (km²), current overlay latitude, and correction factor.

## Run locally

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Deploy on Render

### Option 1: Static Site (recommended)

1. Push this folder to a Git repository.
2. In Render, create a **Static Site**.
3. Set:
   - **Build Command**: *(leave empty)*
   - **Publish Directory**: `.`
4. Deploy.

### Option 2: render.yaml blueprint

This repository includes a `render.yaml` for static deployment via Render Blueprint.
