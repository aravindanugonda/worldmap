# True Country Size Explorer

An interactive world map UI for **true country size comparison**.

## Features

- Click/select a country to create a draggable overlay.
- Drag overlays across the map with geometry-preserving latitude/longitude repositioning, so size comparisons (e.g., Greenland vs India) stay realistic across latitudes.
- Zoom in/out and pan to inspect comparisons in much larger detail.
- Equator, Tropic of Cancer, Tropic of Capricorn, and horizontal latitude guides are visible on the map.
- Country details appear inline in the top controls next to **Clear overlays**.

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
