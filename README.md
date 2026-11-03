# SVG Layer Map — 3D Viewer

Upload an SVG map and turn each top-level layer (`<g>` or shape element directly under `<svg>`) into a 3D slab. Slabs are stacked in document order (first layer at the bottom), scaled to the map size you enter, and extruded by the layer thickness you enter.

## Run with Docker (no local installs needed)

```sh
docker build -t svg-3d-viewer .
docker run -p 8000:80 svg-3d-viewer
# then open http://localhost:8000
```

## Run with a local server

ES modules require a local server (opening `index.html` via `file://` will not work):

```sh
cd svg-3d-viewer
python3 -m http.server 8000
# then open http://localhost:8000
```

## Use

1. Choose an `.svg` file (try `examples/sample-map.svg`).
2. Enter the map width/height in millimeters and the layer thickness in millimeters.
3. Click **Render 3D map** — drag to orbit, scroll to zoom, optionally enable auto-rotate.
4. The layer list appears after rendering; each row has a color picker to recolor that layer live and a checkbox to mark the layer as **engrave only** — engraved layers render as a thin 0.1 mm plate on top of the layer below and add no stack height.

Layers are detected as direct children of the `<svg>` root; `<defs>`, `<style>`, `<title>`, etc. are ignored. CSS inside `<style>` is applied when extracting geometry, and a layer's own `fill`/`stroke` color is used as its initial 3D color when present.
