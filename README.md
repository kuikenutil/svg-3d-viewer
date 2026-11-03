# SVG Layer Map — 3D Viewer

Upload an SVG map and turn each top-level layer (`<g>` or shape element directly under `<svg>`) into a 3D slab. Slabs are stacked in document order (first layer at the bottom), scaled to the map size you enter, and extruded by the layer thickness you enter.

## Run

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
4. The layer list appears after rendering; each row has a color picker to recolor that layer live.

Layers are detected as direct children of the `<svg>` root; `<defs>`, `<style>`, `<title>`, etc. are ignored. CSS inside `<style>` is applied when extracting geometry, and a layer's own `fill`/`stroke` color is used as its initial 3D color when present.
