# True Country Size Explorer

An interactive world map UI that uses an **equal-area projection** (Equal Earth) so country sizes are represented proportionally.

## What it does

- Renders a world map with an equal-area projection to avoid the common Mercator size distortion.
- Lets you click or select a country and create a draggable outline overlay.
- Supports dropping multiple overlays over other countries to visually compare true size.

## Run locally

Because this is a static app, any simple static server works.

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

This repository includes a `render.yaml` to deploy as a static site. After connecting the repo in Render, use **Blueprint** deployment.
