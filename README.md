# SVG Layer Map — 3D Viewer

Upload an SVG map and turn each top-level layer (`<g>` or shape element directly under `<svg>`) into a 3D slab. Slabs are stacked in document order (first layer at the bottom), scaled to the map size you enter, and extruded by the layer thickness you enter.

## Run with Docker Compose (no local installs needed)

```sh
docker compose up --build
# then open http://localhost:8000
```

This mounts `./maps` read-only at `/data` inside the container. To serve a scene from a URL, put `<name>.svg` and `<name>.json` (same base name) into `./maps/` and open `http://localhost:8000/file/<name>` — e.g. copy `examples/demo/` into `./maps/` and open `http://localhost:8000/file/scene1`. The viewer shows a clean full-screen 3D view (no sidebar); if the SVG or JSON is missing, a 404 page is shown.

Equivalent raw docker commands:

```sh
docker build -t svg-3d-viewer .
docker run -p 8000:80 -v "$PWD/maps:/usr/share/nginx/html/data:ro" svg-3d-viewer
```

## Run with a local server

ES modules require a local server (opening `index.html` via `file://` will not work):

```sh
cd svg-3d-viewer
python3 -m http.server 8000
# then open http://localhost:8000
```

Note: `/file/<name>` scene URLs require the nginx routing, so use Docker Compose for those; the manual upload flow above works with any static server.

## Use

1. Choose an `.svg` file (try `examples/sample-map.svg`).
2. Enter the map width/height in millimeters and the layer thickness in millimeters.
3. Click **Render 3D map** — drag to orbit, scroll to zoom, optionally enable auto-rotate.
4. The layer list appears after rendering. Each row has a color picker (recolor live) and a checkbox to mark the layer as **engrave only** — engraved layers render as a thin 0.1 mm plate on top of the layer below and add no stack height.
5. **Reorder** layers by dragging rows (top of the list = bottom of the stack). Use **+ Add group** and drag layers into a group: all layers in a group are rendered at the same height level together. The × button dissolves a group.
6. **Save config (.json)** downloads the current view (dimensions, auto-rotate, layer colors, engrave flags, stack order/groups) as `<svgFileName>.json`. Place it next to the SVG with the same base name in `./maps/` and open it via `/file/<name>` as described above.

## Scene config format

```json
{
  "version": 2,
  "name": "scene1",
  "dimensions": { "widthMm": 120, "heightMm": 90, "thicknessMm": 2 },
  "autoRotate": false,
  "layers": { "0": { "color": "#4e79a7", "engrave": false } },
  "stack": [ { "type": "layer", "index": 0 }, { "type": "group", "id": 1, "children": [1, 2] } ]
}
```

`layers` is keyed by the layer's document index (0-based, order of top-level elements in the SVG). `stack` mirrors the layer list: `layer` items reference a layer index, `group` items render their children at one shared height level.

Layers are detected as direct children of the `<svg>` root; `<defs>`, `<style>`, `<title>`, etc. are ignored. CSS inside `<style>` is applied when extracting geometry, and a layer's own `fill`/`stroke` color is used as its initial 3D color when present.
