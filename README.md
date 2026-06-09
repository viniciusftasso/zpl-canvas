# zpl-canvas

Render ZPL labels to Canvas and PNG in native JavaScript.

`zpl-canvas` is an early renderer for previewing and testing ZPL/ZPL II labels without calling an external rendering service. It parses ZPL into label elements and draws them with the Canvas 2D API.

## Goals

- Compose ZPL labels with a predictable JavaScript API.
- Normalize labels for preview, rendering, and printing.
- Keep the core small and dependency-light.
- Grow into reusable primitives instead of app-specific helpers.

## Status

Prototype renderer. No public API is stable yet.

The current renderer parses ZPL into labels/elements and draws the selected
label through the Canvas 2D API. Multi-label ZPL is supported through the
`labelIndex` render option, which defaults to `0`.

## Online Demo

Try the browser demo:

https://viniciusftasso.github.io/zpl-canvas/

## Install

Browser:

```bash
npm install zpl-canvas
```

Node.js:

```bash
npm install zpl-canvas @napi-rs/canvas
```

`@napi-rs/canvas` is an optional peer dependency. It is only needed when
rendering in Node.js, where there is no built-in Canvas 2D implementation.

## Browser Usage

```js
import { renderZplToCanvas } from "zpl-canvas";

const result = await renderZplToCanvas("^XA^FO40,40^A0N,40,40^FDHello^FS^XZ", {
  dpmm: 8,
  labelWidthMm: 101.6,
  labelHeightMm: 152.4,
  labelIndex: 0,
});

document.body.append(result.canvas);
```

## Node Usage

```js
import { renderZplToPngBuffer } from "zpl-canvas";
import fs from "node:fs/promises";

const result = await renderZplToPngBuffer("^XA^FO40,40^A0N,40,40^FDHello^FS^XZ", {
  dpmm: 8,
  labelWidthMm: 101.6,
  labelHeightMm: 152.4,
  labelIndex: 0,
});

await fs.writeFile("label.png", result.buffer);

console.log(result.metadata.label.copies);
```

If Node rendering is used without installing `@napi-rs/canvas`, the renderer
throws `ZPL_CANVAS_MISSING_NODE_CANVAS` with the install command.

Implemented or recognized command families:

- Label/page: `^XA`, `^XZ`, `^PW`, `^LL`, `^LH`, `^LS`, `^PQ`
- Fields: `^FO`, `^FT`, `^FS`, `^FD`, `^FH`, `^FR`, `^FB`
- Fonts/text: `^CF`, `^A*`
- Graphics: `^GB`, `^GC`, `^GE`, `^GD`, `^GF`
- Stored graphics: `~DG`, `^XG`, `^IM`
- Barcode defaults: `^BY`
- Barcodes: `^BC`, `^B3`, `^BA`, `^B2`, `^BE`, `^BU`, `^B9`,
  `^BK`, `^BQ`, `^BX`, `^B7`, `^BO`, `^BD`
- Known no-op/control commands are accepted so common marketplace labels keep
  rendering while unsupported drawing behavior is added incrementally.

Image support includes raw hex `^GF`, basic Zebra ASCII hex repeat compression,
and Z64 deflate/base64 payloads.

Compatibility notes:

- The default canvas uses the physical label size (`labelWidthMm`,
  `labelHeightMm`, `dpmm`). Use `useZplCanvas: true` to render with `^PW/^LL`
  as the output canvas dimensions.
- Multi-label ZPL is not expanded by `^PQ`. The render result includes
  `metadata.labels[]` with each renderable label's `copies` value so callers can
  decide how to print or display repeated labels.
- Text uses a Zebra-like condensed bold system stack (`Nimbus Sans Narrow`,
  `Liberation Sans Narrow`, `Arial Narrow`, `DejaVu Sans Condensed`,
  Arial/Helvetica fallback). Zebra bitmap font parity is still incremental.
- `^CI28`/`^FH` UTF-8 hex sequences are decoded before drawing.
- Barcode rendering is still being expanded and tuned across label formats.

## Local Check

```bash
npm run check
```
