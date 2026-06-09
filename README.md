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

The current renderer parses ZPL into labels/elements and draws the first selected
label through the Canvas 2D API. It is designed so the parser/render operations
can be improved without changing consuming applications.

## Install

```bash
npm install zpl-canvas
```

## Usage

```js
import { renderZplToPngBuffer } from "zpl-canvas";

const result = await renderZplToPngBuffer("^XA^FO40,40^A0N,40,40^FDHello^FS^XZ", {
  dpmm: 8,
  labelWidthMm: 101.6,
  labelHeightMm: 152.4,
});

await fs.promises.writeFile("label.png", result.buffer);
```

Implemented or recognized command families:

- Label/page: `^XA`, `^XZ`, `^PW`, `^LL`, `^LH`, `^LS`
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
  `labelHeightMm`, `dpmm`) to match BinaryKits. Use `useZplCanvas: true` to
  render with `^PW/^LL` as the output canvas dimensions.
- Text uses a Zebra-like condensed bold system stack (`Nimbus Sans Narrow`,
  `Liberation Sans Narrow`, `Arial Narrow`, `DejaVu Sans Condensed`,
  Arial/Helvetica fallback). Zebra bitmap font parity is still incremental.
- `^CI28`/`^FH` UTF-8 hex sequences are decoded before drawing.
- Code128 rendering is calibrated against BinaryKits for the common `^BY/^BC`
  marketplace-label path.

## Local Check

```bash
npm run check
```
