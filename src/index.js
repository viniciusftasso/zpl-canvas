import { createCanvas, loadImage } from "@napi-rs/canvas";
import bwipjs from "bwip-js";
import zlib from "zlib";

export const ZPLUMA_VERSION = "0.0.0";

const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
const utf8Encoder = new TextEncoder();
const DEFAULT_DPMM = 8;
const DEFAULT_WIDTH_MM = 101.6;
const DEFAULT_HEIGHT_MM = 152.4;
const DEFAULT_FONT_HEIGHT = 30;
const DEFAULT_FONT_WIDTH = 24;
const DEFAULT_FONT_FAMILY =
  '"Nimbus Sans Narrow", "Liberation Sans Narrow", "Arial Narrow", "DejaVu Sans Condensed", Arial, Helvetica, sans-serif';
const BITMAP_FONT_FAMILY =
  '"Liberation Mono", "Courier New", Courier, monospace';
const DEFAULT_FONT_WEIGHT = "700";
const REGULAR_FONT_WEIGHT = "400";
const FIELD_BLOCK_LINE_BREAK = "\uE000";
const COMMAND_PREFIXES = new Set(["^", "~"]);
const KNOWN_NOOP_COMMANDS = new Set([
  "FX",
  "CI",
  "MM",
  "MN",
  "MT",
  "PR",
  "LS",
  "LT",
  "MC",
  "MD",
  "SD",
  "JM",
  "PM",
  "PO",
  "CT",
  "CC",
  "CD",
  "LR",
  "FW",
  "FN",
  "DF",
  "XF",
  "XG",
  "ID",
  "IM",
  "IS",
  "IL",
  "ML",
  "MU",
]);

const REPEAT_COUNTS = new Map([
  ["G", 1],
  ["H", 2],
  ["I", 3],
  ["J", 4],
  ["K", 5],
  ["L", 6],
  ["M", 7],
  ["N", 8],
  ["O", 9],
  ["P", 10],
  ["Q", 11],
  ["R", 12],
  ["S", 13],
  ["T", 14],
  ["U", 15],
  ["V", 16],
  ["W", 17],
  ["X", 18],
  ["Y", 19],
  ["g", 20],
  ["h", 40],
  ["i", 60],
  ["j", 80],
  ["k", 100],
  ["l", 120],
  ["m", 140],
  ["n", 160],
  ["o", 180],
  ["p", 200],
  ["q", 220],
  ["r", 240],
  ["s", 260],
  ["t", 280],
  ["u", 300],
  ["v", 320],
  ["w", 340],
  ["x", 360],
  ["y", 380],
  ["z", 400],
]);

const clampPositive = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloat = (value, fallback = 0) => {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

const splitParams = (raw = "") => String(raw).split(",");

const normalizeCommand = (prefix, rawCode) => {
  const code = String(rawCode || "").toUpperCase();
  return prefix === "~" ? `~${code}` : code;
};

const isCommandStart = (source, index) => {
  if (!COMMAND_PREFIXES.has(source[index]) || index + 1 >= source.length) return false;
  if (source[index] === "~") return /^[A-Z0-9]$/i.test(source[index + 1]);
  return true;
};

const readCommandCode = (source, startIndex) => {
  const prefix = source[startIndex];
  const first = source[startIndex + 1] || "";
  const second = source[startIndex + 2] || "";

  if (!first) return { prefix, code: "", dataStart: startIndex + 1 };
  if (first.toUpperCase() === "A" && /^[A-Z0-9@]$/i.test(second)) {
    return { prefix, code: `${first}${second}`, dataStart: startIndex + 3 };
  }
  if (first.toUpperCase() === "B" && /^[A-Z0-9]$/i.test(second)) {
    return { prefix, code: `${first}${second}`, dataStart: startIndex + 3 };
  }
  if (/^[A-Z0-9]$/i.test(first) && /^[A-Z0-9]$/i.test(second)) {
    return { prefix, code: `${first}${second}`, dataStart: startIndex + 3 };
  }
  return { prefix, code: first, dataStart: startIndex + 2 };
};

const tokenizeZpl = (zpl = "") => {
  const source = String(zpl || "");
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    if (!isCommandStart(source, index)) {
      index += 1;
      continue;
    }

    const { prefix, code, dataStart } = readCommandCode(source, index);
    let dataEnd = dataStart;
    while (dataEnd < source.length && !isCommandStart(source, dataEnd)) {
      dataEnd += 1;
    }

    tokens.push({
      prefix,
      code: normalizeCommand(prefix, code),
      rawCode: code,
      data: source.slice(dataStart, dataEnd),
    });
    index = dataEnd;
  }

  return tokens;
};

const createLabelState = (options = {}) => {
  const dpmm = clampPositive(options.dpmm, DEFAULT_DPMM);
  const physicalWidth = Math.round(clampPositive(options.labelWidthMm, DEFAULT_WIDTH_MM) * dpmm);
  const physicalHeight = Math.round(clampPositive(options.labelHeightMm, DEFAULT_HEIGHT_MM) * dpmm);
  return {
    width: physicalWidth,
    height: physicalHeight,
    physicalWidth,
    physicalHeight,
    dpmm,
    home: { x: 0, y: 0 },
    shiftX: 0,
    elements: [],
    warnings: [],
    metadata: {
      copies: 1,
      printQuantity: {
        quantity: 1,
        pauseAndCut: 0,
        replicates: 0,
        overridePause: false,
        cutOnError: false,
        rawParams: [],
      },
    },
  };
};

const createFieldState = () => ({
  x: 0,
  y: 0,
  originMode: "FO",
  orientation: "N",
  fontName: "0",
  fontHeight: DEFAULT_FONT_HEIGHT,
  fontWidth: DEFAULT_FONT_WIDTH,
  fontWidthSpecified: false,
  defaultFont: {
    name: "0",
    height: DEFAULT_FONT_HEIGHT,
    width: DEFAULT_FONT_WIDTH,
    widthSpecified: false,
  },
  block: null,
  reverse: false,
  hexIndicator: null,
  encoding: "latin1",
  data: "",
  pendingGraphic: null,
  pendingBarcode: null,
});

const resolvePosition = (label, field) => ({
  x: Math.round((field.x || 0) + (label.home?.x || 0) + (label.shiftX || 0)),
  y: Math.round((field.y || 0) + (label.home?.y || 0)),
});

const decodeFieldHex = (value, indicator = "_", encoding = "latin1") => {
  const source = String(value || "");
  if (!indicator) return source;
  const bytes = [];
  let hasHex = false;
  for (let index = 0; index < source.length; index += 1) {
    if (
      source[index] === indicator &&
      /^[0-9a-f]{2}$/i.test(source.slice(index + 1, index + 3))
    ) {
      bytes.push(Number.parseInt(source.slice(index + 1, index + 3), 16));
      hasHex = true;
      index += 2;
    } else {
      const literal = source[index];
      if (encoding === "utf8") bytes.push(...utf8Encoder.encode(literal));
      else bytes.push(literal.charCodeAt(0) & 0xff);
    }
  }
  if (!hasHex) return source;
  if (encoding === "utf8") return utf8Decoder.decode(Uint8Array.from(bytes));
  return String.fromCharCode(...bytes);
};

const mapZplColor = (raw, fallback = "black") => {
  const color = String(raw || "").trim().toUpperCase();
  if (color === "W") return "white";
  if (color === "B") return "black";
  return fallback;
};

const normalizeOrientation = (raw, fallback = "N") => {
  const value = String(raw || "").trim().toUpperCase();
  return ["N", "R", "I", "B"].includes(value) ? value : fallback;
};

const addElement = (label, field, element) => {
  const position = resolvePosition(label, field);
  label.elements.push({
    x: position.x,
    y: position.y,
    orientation: normalizeOrientation(element.orientation || field.orientation),
    reverse: Boolean(field.reverse || element.reverse),
    ...element,
  });
};

const finalizeField = (label, field) => {
  if (field.pendingGraphic) {
    addElement(label, field, field.pendingGraphic);
  } else if (field.pendingBarcode) {
    addElement(label, field, {
      type: "barcode",
      data: field.data,
      originMode: field.originMode,
      ...field.pendingBarcode,
    });
  } else if (field.data) {
    addElement(label, field, {
      type: "text",
      data: field.data,
      fontName: field.fontName,
      fontHeight: field.fontHeight,
      fontWidth: field.fontWidth,
      fontWidthSpecified: field.fontWidthSpecified,
      block: field.block ? { ...field.block } : null,
      originMode: field.originMode,
    });
  }

  const currentDefault = field.defaultFont;
  const next = createFieldState();
  next.defaultFont = currentDefault;
  next.fontName = currentDefault.name;
  next.fontHeight = currentDefault.height;
  next.fontWidth = currentDefault.width;
  next.fontWidthSpecified = currentDefault.widthSpecified;
  next.encoding = field.encoding;
  Object.assign(field, next);
};

const applyFontCommand = (field, code, data) => {
  const params = splitParams(data);
  const widthSpecified = params.length > 2 && String(params[2] || "").trim() !== "";
  field.fontName = code.slice(1) || field.defaultFont.name;
  field.orientation = normalizeOrientation(params[0], field.orientation);
  field.fontHeight = toInt(params[1], field.defaultFont.height);
  field.fontWidth = toInt(params[2], field.fontHeight || field.defaultFont.width);
  field.fontWidthSpecified = widthSpecified || field.defaultFont.widthSpecified;
};

const applyBarcodeCommand = (field, code, data, barcodeDefault = {}) => {
  const params = splitParams(data);
  const orientation = normalizeOrientation(params[0], field.orientation);
  const isCode39 = code === "B3";
  const height = isCode39
    ? toInt(params[2], barcodeDefault.height || 100)
    : toInt(params[1], barcodeDefault.height || 100);
  const printTextRaw = String(params[isCode39 ? 3 : 2] || "").trim().toUpperCase();
  const printText = printTextRaw ? printTextRaw === "Y" : code === "BC";
  const above = String(params[isCode39 ? 4 : 3] || "").trim().toUpperCase() === "Y";
  const checkDigit = String(params[isCode39 ? 1 : 4] || "").trim().toUpperCase() === "Y";
  field.pendingBarcode = {
    barcodeType: code,
    orientation,
    height,
    printText,
    textAbove: above,
    checkDigit,
    rawParams: params,
    moduleWidth: barcodeDefault.moduleWidth,
    wideBarToNarrowRatio: barcodeDefault.ratio,
  };
};

const parseBooleanFlag = (value, fallback = false) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return fallback;
  return ["Y", "YES", "1", "TRUE"].includes(normalized);
};

const parsePrintQuantity = (data) => {
  const params = splitParams(data);
  const quantity = Math.max(toInt(params[0], 1), 1);
  return {
    copies: quantity,
    printQuantity: {
      quantity,
      pauseAndCut: Math.max(toInt(params[1], 0), 0),
      replicates: Math.max(toInt(params[2], 0), 0),
      overridePause: parseBooleanFlag(params[3]),
      cutOnError: parseBooleanFlag(params[4]),
      rawParams: params,
    },
  };
};

const applyCommand = (token, context) => {
  const { labels, resources, options } = context;
  let label = context.currentLabel;
  const field = context.field;
  const code = token.code;
  const data = token.data || "";

  if (code === "XA") {
    label = createLabelState(options);
    labels.push(label);
    context.currentLabel = label;
    Object.assign(field, createFieldState());
    return;
  }

  if (code === "~DG") {
    const params = splitParams(data);
    const name = String(params[0] || "").trim().toUpperCase();
    if (name) {
      resources.set(name, {
        type: "graphicField",
        format: "A",
        totalBytes: toInt(params[1], 0),
        dataBytes: toInt(params[1], 0),
        rowBytes: Math.max(toInt(params[2], 0), 0),
        data: params.slice(3).join(","),
      });
    }
    return;
  }

  if (!label) {
    if (KNOWN_NOOP_COMMANDS.has(code)) return;
    label = createLabelState(options);
    labels.push(label);
    context.currentLabel = label;
  }

  if (code === "XZ") {
    finalizeField(label, field);
    context.currentLabel = null;
    Object.assign(field, createFieldState());
    return;
  }

  if (code === "PW") {
    label.width = Math.max(toInt(data, label.width), 1);
    return;
  }
  if (code === "LL") {
    label.height = Math.max(toInt(data, label.height), 1);
    return;
  }
  if (code === "LH") {
    const [x, y] = splitParams(data);
    label.home = { x: toInt(x, 0), y: toInt(y, 0) };
    return;
  }
  if (code === "LS") {
    label.shiftX = toInt(data, label.shiftX);
    return;
  }
  if (code === "CI") {
    const charset = String(data || "").split(",")[0]?.trim();
    const encoding = ["27", "28", "30"].includes(charset) ? "utf8" : "latin1";
    field.encoding = encoding;
    label.encoding = encoding;
    return;
  }
  if (code === "PQ") {
    Object.assign(label.metadata, parsePrintQuantity(data));
    return;
  }
  if (code === "FO" || code === "FT") {
    const [x, y] = splitParams(data);
    field.x = toInt(x, 0);
    field.y = toInt(y, 0);
    field.originMode = code;
    return;
  }
  if (code === "FW") {
    field.orientation = normalizeOrientation(data, field.orientation);
    return;
  }
  if (code === "FS") {
    finalizeField(label, field);
    return;
  }
  if (code === "FD") {
    field.data = decodeFieldHex(data, field.hexIndicator, field.encoding);
    return;
  }
  if (code === "FH") {
    const indicator = String(data || "_").trim()[0] || "_";
    field.hexIndicator = indicator;
    return;
  }
  if (code === "CF") {
    const [name, height, width] = splitParams(data);
    const widthSpecified = String(width || "").trim() !== "";
    field.defaultFont = {
      name: String(name || "0").trim() || "0",
      height: toInt(height, field.defaultFont.height),
      width: toInt(width, toInt(height, field.defaultFont.width)),
      widthSpecified,
    };
    field.fontName = field.defaultFont.name;
    field.fontHeight = field.defaultFont.height;
    field.fontWidth = field.defaultFont.width;
    field.fontWidthSpecified = field.defaultFont.widthSpecified;
    return;
  }
  if (/^A[A-Z0-9@]$/i.test(code)) {
    applyFontCommand(field, code, data);
    return;
  }
  if (code === "FB") {
    const [width, maxLines, lineSpacing, justification, hangingIndent] = splitParams(data);
    field.block = {
      width: toInt(width, 0),
      maxLines: Math.max(toInt(maxLines, 1), 1),
      lineSpacing: toInt(lineSpacing, 0),
      justification: String(justification || "L").trim().toUpperCase() || "L",
      hangingIndent: toInt(hangingIndent, 0),
    };
    return;
  }
  if (code === "FR") {
    field.reverse = true;
    return;
  }
  if (code === "GB") {
    const [width, height, thickness, color, rounding] = splitParams(data);
    field.pendingGraphic = {
      type: "box",
      width: Math.max(toInt(width, 0), 0),
      height: Math.max(toInt(height, 0), 0),
      thickness: Math.max(toInt(thickness, 1), 1),
      color: mapZplColor(color),
      rounding: Math.max(toInt(rounding, 0), 0),
    };
    return;
  }
  if (code === "GC") {
    const [diameter, thickness, color] = splitParams(data);
    field.pendingGraphic = {
      type: "circle",
      diameter: Math.max(toInt(diameter, 0), 0),
      thickness: Math.max(toInt(thickness, 1), 1),
      color: mapZplColor(color),
    };
    return;
  }
  if (code === "GE") {
    const [width, height, thickness, color] = splitParams(data);
    field.pendingGraphic = {
      type: "ellipse",
      width: Math.max(toInt(width, 0), 0),
      height: Math.max(toInt(height, 0), 0),
      thickness: Math.max(toInt(thickness, 1), 1),
      color: mapZplColor(color),
    };
    return;
  }
  if (code === "GD") {
    const [width, height, thickness, color, orientation] = splitParams(data);
    field.pendingGraphic = {
      type: "diagonal",
      width: Math.max(toInt(width, 0), 0),
      height: Math.max(toInt(height, 0), 0),
      thickness: Math.max(toInt(thickness, 1), 1),
      color: mapZplColor(color),
      diagonalOrientation: String(orientation || "R").trim().toUpperCase() || "R",
    };
    return;
  }
  if (code === "GF") {
    const params = splitParams(data);
    field.pendingGraphic = {
      type: "graphicField",
      format: String(params[0] || "A").trim().toUpperCase(),
      totalBytes: toInt(params[1], 0),
      dataBytes: toInt(params[2], 0),
      rowBytes: Math.max(toInt(params[3], 0), 0),
      data: params.slice(4).join(","),
    };
    return;
  }
  if (code === "XG" || code === "IM") {
    const [name, xScale, yScale] = splitParams(data);
    field.pendingGraphic = {
      type: "recallGraphic",
      name: String(name || "").trim().toUpperCase(),
      xScale: Math.max(toInt(xScale, 1), 1),
      yScale: Math.max(toInt(yScale, 1), 1),
    };
    return;
  }
  if (code === "BY") {
    const [moduleWidth, ratio, height] = splitParams(data);
    context.barcodeDefault = {
      moduleWidth: Math.max(Math.round(toFloat(moduleWidth, context.barcodeDefault.moduleWidth)), 1),
      ratio: toFloat(ratio, context.barcodeDefault.ratio),
      height: toInt(height, context.barcodeDefault.height),
    };
    return;
  }
  if (/^B[A-Z0-9]$/i.test(code)) {
    applyBarcodeCommand(field, code, data, context.barcodeDefault);
    return;
  }

  if (!KNOWN_NOOP_COMMANDS.has(code)) {
    label.warnings.push(`Unsupported command ${token.prefix}${token.rawCode}`);
  }
};

export const parseZpl = (zpl, options = {}) => {
  const tokens = tokenizeZpl(zpl);
  const labels = [];
  const context = {
    labels,
    currentLabel: null,
    resources: new Map(),
    options,
    field: createFieldState(),
    barcodeDefault: {
      moduleWidth: 2,
      ratio: 3,
      height: 100,
    },
  };

  for (const token of tokens) {
    applyCommand(token, context);
  }

  if (context.currentLabel && context.field.data) {
    finalizeField(context.currentLabel, context.field);
  }
  const renderableLabels = labels.filter((label) => label.elements.length > 0);

  return {
    labels: renderableLabels,
    resources: context.resources,
    tokens,
    warnings: renderableLabels.flatMap((label) => label.warnings || []),
  };
};

const withOrientation = (ctx, element, draw) => {
  const angleByOrientation = {
    N: 0,
    R: Math.PI / 2,
    I: Math.PI,
    B: (Math.PI * 3) / 2,
  };
  ctx.save();
  ctx.translate(element.x || 0, element.y || 0);
  ctx.rotate(angleByOrientation[normalizeOrientation(element.orientation)] || 0);
  draw();
  ctx.restore();
};

const applyElementPaint = (ctx, element, fallback = "black") => {
  const color = element.reverse ? "white" : element.color || fallback;
  if (element.reverse) ctx.globalCompositeOperation = "difference";
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
};

const getDarkBackgroundRatio = (ctx, x, y, width, height) => {
  const left = Math.max(Math.floor(x), 0);
  const top = Math.max(Math.floor(y), 0);
  const right = Math.min(Math.ceil(x + width), ctx.canvas.width);
  const bottom = Math.min(Math.ceil(y + height), ctx.canvas.height);
  const sampleWidth = Math.max(right - left, 0);
  const sampleHeight = Math.max(bottom - top, 0);
  if (!sampleWidth || !sampleHeight) return 0;

  const imageData = ctx.getImageData(left, top, sampleWidth, sampleHeight).data;
  let darkPixels = 0;
  for (let index = 0; index < imageData.length; index += 4) {
    const alpha = imageData[index + 3];
    if (!alpha) continue;
    const red = imageData[index];
    const green = imageData[index + 1];
    const blue = imageData[index + 2];
    if (red < 128 && green < 128 && blue < 128) darkPixels += 1;
  }
  return darkPixels / (sampleWidth * sampleHeight);
};

const resolveTextPaintColor = (ctx, element, sampleWidth, sampleHeight) => {
  if (!element.reverse) return element.color || "black";
  const darkRatio = getDarkBackgroundRatio(
    ctx,
    element.x || 0,
    element.y || 0,
    sampleWidth,
    sampleHeight
  );
  return darkRatio > 0.2 ? "white" : element.color || "black";
};

const drawBox = (ctx, element) => {
  const width = Math.max(element.width || 0, 0);
  const height = Math.max(element.height || 0, 0);
  const thickness = Math.max(element.thickness || 1, 1);
  withOrientation(ctx, element, () => {
    applyElementPaint(ctx, element);
    if (width > 0 && height === 0) {
      ctx.fillRect(0, 0, width, thickness);
      return;
    }
    if (width === 0 && height > 0) {
      ctx.fillRect(0, 0, thickness, height);
      return;
    }
    if (thickness >= Math.min(width, height)) {
      ctx.fillRect(0, 0, width, height);
      return;
    }
    ctx.lineWidth = thickness;
    ctx.strokeRect(thickness / 2, thickness / 2, Math.max(width - thickness, 1), Math.max(height - thickness, 1));
  });
};

const drawCircle = (ctx, element) => {
  const diameter = Math.max(element.diameter || 0, 0);
  const thickness = Math.max(element.thickness || 1, 1);
  withOrientation(ctx, element, () => {
    applyElementPaint(ctx, element);
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.arc(diameter / 2, diameter / 2, Math.max((diameter - thickness) / 2, 1), 0, Math.PI * 2);
    ctx.stroke();
  });
};

const drawEllipse = (ctx, element) => {
  const width = Math.max(element.width || 0, 0);
  const height = Math.max(element.height || 0, 0);
  const thickness = Math.max(element.thickness || 1, 1);
  withOrientation(ctx, element, () => {
    applyElementPaint(ctx, element);
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2, Math.max((width - thickness) / 2, 1), Math.max((height - thickness) / 2, 1), 0, 0, Math.PI * 2);
    ctx.stroke();
  });
};

const drawDiagonal = (ctx, element) => {
  const width = Math.max(element.width || 0, 0);
  const height = Math.max(element.height || 0, 0);
  const thickness = Math.max(element.thickness || 1, 1);
  withOrientation(ctx, element, () => {
    applyElementPaint(ctx, element);
    ctx.lineWidth = thickness;
    ctx.beginPath();
    if (element.diagonalOrientation === "L") {
      ctx.moveTo(width, 0);
      ctx.lineTo(0, height);
    } else {
      ctx.moveTo(0, 0);
      ctx.lineTo(width, height);
    }
    ctx.stroke();
  });
};

const wrapText = (ctx, text, maxWidth) => {
  if (!maxWidth) return String(text || "").split(/\r?\n/);
  const lines = [];
  const sourceLines = String(text || "").split(/\r?\n/);
  for (const sourceLine of sourceLines) {
    const words = sourceLine.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
};

const normalizeTextGlyphs = (text) =>
  String(text || "")
    .replace(/\\&/g, FIELD_BLOCK_LINE_BREAK)
    .replace(/\s*\r?\n\s*/g, " ")
    .replaceAll(FIELD_BLOCK_LINE_BREAK, "\n")
    .replace(/(\S)-(\S)/g, "$1\u2009\u2013\u2009$2")
    .replace(/-/g, "\u2013");

const BITMAP_FONT_NAMES = new Set(["A", "B", "C", "D", "E", "F", "G", "H"]);

const resolveTextMetrics = (element, height) => {
  const width = Math.max(element.fontWidth || height, 1);
  const fontName = String(element.fontName || "").toUpperCase();
  if (BITMAP_FONT_NAMES.has(fontName)) {
    if (!element.fontWidthSpecified) {
      return {
        fontHeight: height,
        widthRatio: 1,
        family: BITMAP_FONT_FAMILY,
        weight: REGULAR_FONT_WEIGHT,
      };
    }
    return {
      fontHeight: Math.max(Math.round(height * 1.06), 1),
      widthRatio: Math.max(width / Math.max(height * 0.47, 1), 0.35),
      family: DEFAULT_FONT_FAMILY,
      weight: DEFAULT_FONT_WEIGHT,
    };
  }
  return {
    fontHeight: height,
    widthRatio: Math.max(width / height, 0.35),
    family: DEFAULT_FONT_FAMILY,
    weight: DEFAULT_FONT_WEIGHT,
  };
};

const drawText = (ctx, element) => {
  const requestedHeight = Math.max(element.fontHeight || DEFAULT_FONT_HEIGHT, 1);
  const { fontHeight: height, widthRatio, family, weight } = resolveTextMetrics(element, requestedHeight);
  const textFamily = element.fontFamily || family;
  const block = element.block;
  const lineHeight = height + (block?.lineSpacing || 0);

  ctx.save();
  ctx.font = `${weight} ${height}px ${textFamily}`;
  ctx.textBaseline = element.originMode === "FT" ? "alphabetic" : "top";

  const maxWidth = block?.width ? block.width / widthRatio : 0;
  let lines = wrapText(ctx, normalizeTextGlyphs(element.data), maxWidth);
  if (block?.maxLines) lines = lines.slice(0, block.maxLines);
  const baselineOffset = element.originMode === "FT" ? 0 : Math.round(height * 0.125);
  const measuredWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 1);
  const sampleWidth = Math.ceil(block?.width || measuredWidth * widthRatio);
  const sampleHeight = Math.ceil(baselineOffset + Math.max(lines.length, 1) * lineHeight);
  const paintColor = resolveTextPaintColor(ctx, element, sampleWidth, sampleHeight);
  const orientation = normalizeOrientation(element.orientation);

  ctx.translate(element.x || 0, element.y || 0);
  if (orientation === "R") {
    ctx.rotate(Math.PI / 2);
    ctx.translate(0, 5 - sampleHeight);
  } else if (orientation === "I") {
    ctx.rotate(Math.PI);
    ctx.translate(-sampleWidth, -sampleHeight);
  } else if (orientation === "B") {
    ctx.rotate((Math.PI * 3) / 2);
    ctx.translate(-sampleWidth, 0);
  }

  ctx.fillStyle = paintColor;
  ctx.strokeStyle = paintColor;
  ctx.scale(widthRatio, 1);

  lines.forEach((line, index) => {
    let x = 0;
    if (block?.justification === "C" && maxWidth) {
      x = (maxWidth - ctx.measureText(line).width) / 2;
    } else if (block?.justification === "R" && maxWidth) {
      x = maxWidth - ctx.measureText(line).width;
    }
    if (index > 0 && block?.hangingIndent) x += block.hangingIndent / widthRatio;
    const y = baselineOffset + index * lineHeight;
    ctx.fillText(line, x, y);
  });
  ctx.restore();
};

const normalizeGraphicHexRows = (payload, rowBytes, expectedRows, warnings) => {
  const rowHexLength = Math.max(rowBytes * 2, 0);
  const zeroRow = "0".repeat(rowHexLength);
  const rows = [];
  let previous = zeroRow;
  const source = String(payload || "").replace(/\s+/g, "");

  if (!source.includes(",") && /^[0-9a-f]+$/i.test(source)) {
    for (let index = 0; index < source.length; index += rowHexLength) {
      rows.push(source.slice(index, index + rowHexLength).padEnd(rowHexLength, "0"));
    }
    return rows;
  }

  let row = "";
  let repeatCount = 0;
  const pushRow = (fill = "0") => {
    const normalized = row.slice(0, rowHexLength).padEnd(rowHexLength, fill);
    rows.push(normalized);
    previous = normalized;
    row = row.slice(rowHexLength);
  };

  for (const char of source) {
    if (char === ",") {
      pushRow("0");
      continue;
    }
    if (char === "!") {
      pushRow("F");
      continue;
    }
    if (char === ":") {
      while (row.length >= rowHexLength) pushRow("0");
      if (row) pushRow("0");
      rows.push(previous);
      continue;
    }
    if (REPEAT_COUNTS.has(char)) {
      repeatCount += REPEAT_COUNTS.get(char);
      continue;
    }
    if (/^[0-9a-f]$/i.test(char)) {
      row += char.repeat(repeatCount || 1);
      repeatCount = 0;
      while (row.length >= rowHexLength) pushRow("0");
    }
  }

  if (repeatCount) {
    warnings.push("Dangling ^GF compression repeat count ignored.");
  }
  if (row) pushRow("0");

  while (expectedRows && rows.length < expectedRows) {
    rows.push(zeroRow);
  }

  return rows;
};

const normalizeGraphicByteLength = (bytes, targetBytes) => {
  if (!Buffer.isBuffer(bytes) || !targetBytes) return bytes;
  if (bytes.length === targetBytes) return bytes;
  if (bytes.length > targetBytes) return bytes.subarray(0, targetBytes);

  const output = Buffer.alloc(targetBytes);
  bytes.copy(output);
  return output;
};

const getGraphicByteCount = (element) =>
  Math.max(element.totalBytes || 0, element.dataBytes || 0, 0);

const decodeGraphicPayload = (element, warnings) => {
  const rowBytes = Math.max(element.rowBytes || 0, 0);
  if (!rowBytes) return null;
  const totalBytes = getGraphicByteCount(element);

  const graphicData = String(element.data || "").trim();
  if (/^:Z64:/i.test(graphicData)) {
    const match = graphicData.match(/^:Z64:([\s\S]*):([0-9a-f]{4})$/i);
    if (!match) {
      warnings.push("Invalid ^GF Z64 payload.");
      return null;
    }
    try {
      return normalizeGraphicByteLength(
        zlib.inflateSync(Buffer.from(match[1].replace(/\s+/g, ""), "base64")),
        totalBytes
      );
    } catch {
      warnings.push("Could not inflate ^GF Z64 payload.");
      return null;
    }
  }

  const expectedRows = totalBytes ? Math.ceil(totalBytes / rowBytes) : 0;
  const rows = normalizeGraphicHexRows(element.data, rowBytes, expectedRows, warnings);
  return normalizeGraphicByteLength(
    Buffer.from(rows.join("").slice(0, totalBytes ? totalBytes * 2 : undefined), "hex"),
    totalBytes
  );
};

const createImageDataFromGraphic = (ctx, element, warnings) => {
  const bytes = decodeGraphicPayload(element, warnings);
  const rowBytes = Math.max(element.rowBytes || 0, 0);
  if (!bytes || !rowBytes) return null;

  const totalBytes = getGraphicByteCount(element);
  const width = rowBytes * 8;
  const height = Math.max(
    totalBytes ? Math.ceil(totalBytes / rowBytes) : Math.ceil(bytes.length / rowBytes),
    1
  );
  const normalizedBytes = normalizeGraphicByteLength(bytes, height * rowBytes);
  const imageData = ctx.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let xb = 0; xb < rowBytes; xb += 1) {
      const byte = normalizedBytes[y * rowBytes + xb] || 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = xb * 8 + bit;
        const isBlack = Boolean(byte & (1 << (7 - bit)));
        const index = (y * width + x) * 4;
        const value = isBlack ? 0 : 255;
        imageData.data[index] = value;
        imageData.data[index + 1] = value;
        imageData.data[index + 2] = value;
        imageData.data[index + 3] = isBlack ? 255 : 0;
      }
    }
  }
  return imageData;
};

const drawGraphicField = (ctx, element, warnings) => {
  const imageData = createImageDataFromGraphic(ctx, element, warnings);
  if (!imageData) return;
  const tempCanvas = createCanvas(imageData.width, imageData.height);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.putImageData(imageData, 0, 0);
  const xScale = Math.max(element.xScale || 1, 1);
  const yScale = Math.max(element.yScale || 1, 1);
  withOrientation(ctx, element, () => {
    ctx.drawImage(tempCanvas, 0, 0, imageData.width * xScale, imageData.height * yScale);
  });
};

const barcodeMap = {
  BC: "code128",
  B3: "code39",
  BA: "code93",
  B2: "interleaved2of5",
  BE: "ean13",
  BU: "upca",
  B9: "upce",
  BK: "rationalizedCodabar",
  BQ: "qrcode",
  BX: "datamatrix",
  B7: "pdf417",
  BO: "azteccode",
  BD: "maxicode",
};

const normalizeBarcodeText = (element) => {
  return String(element.data || "").trim();
};

const ZPL_CODE128_INVOCATION_CODES = new Set(["<", "0", "=", "1", "2", "3", "4", "5", "6", "7", "8", "9", ":", ";"]);
const ZPL_CODE128_CONTROL_CODES = new Set(["4", "5", "6", "7", "9", ":", ";"]);

const normalizeCode128Payload = (value, { stripZplStartCode = false } = {}) => {
  const text = String(value || "").trim();
  const zplInvocations = [...text.matchAll(/>([<0=1-9:;])/g)];
  const startCode = text.match(/^>([9:;])/)?.[1] || null;
  const hasZplStartCode = Boolean(startCode);
  const hasInternalInvocations = zplInvocations.some((match) => match.index > 0);
  const shouldTranslateInvocations =
    hasInternalInvocations || (stripZplStartCode && hasZplStartCode);

  if (!shouldTranslateInvocations) {
    return {
      text,
      humanText: text,
      hasZplStartCode,
      startCode,
      hasInternalInvocations,
      hasParseFnc: false,
    };
  }

  let barcodeText = "";
  let humanText = "";
  let hasParseFnc = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== ">" || index + 1 >= text.length) {
      barcodeText += char;
      humanText += char;
      continue;
    }

    const invocation = text[index + 1];
    if (!ZPL_CODE128_INVOCATION_CODES.has(invocation)) {
      barcodeText += char;
      humanText += char;
      continue;
    }

    index += 1;
    if (invocation === "<") {
      barcodeText += ">";
      humanText += ">";
    } else if (invocation === "8") {
      barcodeText += "^FNC1";
      hasParseFnc = true;
    } else if (invocation === "2") {
      barcodeText += "^FNC3";
      hasParseFnc = true;
    } else if (invocation === "3") {
      barcodeText += "^FNC2";
      hasParseFnc = true;
    } else if (!ZPL_CODE128_CONTROL_CODES.has(invocation)) {
      barcodeText += invocation === "=" ? "~" : "";
      humanText += invocation === "=" ? "~" : "";
    }
  }

  return {
    text: barcodeText,
    humanText,
    hasZplStartCode,
    startCode,
    hasInternalInvocations,
    hasParseFnc,
  };
};

const normalizeQrPayload = (value, fallbackEclevel = "M") => {
  let text = String(value || "");
  let eclevel = String(fallbackEclevel || "M").trim().toUpperCase() || "M";
  const modeMatch = text.match(/^([HQLM])([A-Z0-9]),/i);
  if (modeMatch) {
    eclevel = modeMatch[1].toUpperCase();
    text = text.slice(modeMatch[0].length);
  } else {
    text = text.replace(/^[A-Z0-9]{2},/, "");
  }
  return { text, eclevel };
};

const isOneDimensionalBarcode = (barcodeType) =>
  ["BC", "B3", "BA", "B2", "BE", "BU", "B9", "BK"].includes(barcodeType);

const renderBarcodeImage = async (element, barcodeDefault, warnings) => {
  const bcid = barcodeMap[element.barcodeType];
  if (!bcid) {
    warnings.push(`Unsupported barcode ${element.barcodeType}.`);
    return null;
  }

  let text = normalizeBarcodeText(element);
  let qrPayload = null;
  let code128Payload = null;
  let separateHumanText = false;
  let humanText = null;
  if (element.barcodeType === "BQ") {
    qrPayload = normalizeQrPayload(text, element.rawParams?.[3]);
    text = qrPayload.text;
  } else if (element.barcodeType === "BC") {
    code128Payload = normalizeCode128Payload(text, {
      stripZplStartCode: Boolean(element.printText),
    });
    text = code128Payload.text;
  }
  if (!text) return null;

  const moduleWidth = Math.max(element.moduleWidth || barcodeDefault?.moduleWidth || 2, 1);
  const scale = Math.max(moduleWidth, 1);
  const hasHumanText = Boolean(element.printText && isOneDimensionalBarcode(element.barcodeType));
  const options = {
    bcid,
    text,
    scale,
    height: Math.max((element.height || barcodeDefault?.height || 100) / 8, 4),
    includetext: Boolean(element.printText),
    textxalign: "center",
    textyalign: element.textAbove ? "above" : "below",
    paddingwidth: 0,
    paddingheight: 0,
    backgroundcolor: "FFFFFF",
  };
  if (hasHumanText) {
    options.textyoffset = element.textAbove ? 1 : -2;
  }
  if (hasHumanText && code128Payload?.humanText && code128Payload.humanText !== text) {
    options.alttext = code128Payload.humanText;
  }

  let drawScaleX = 1;
  let drawScaleY = 1;
  if (element.barcodeType === "BC") {
    if (code128Payload?.hasParseFnc) options.parsefnc = true;
    const isNumeric = /^\d+$/.test(text);
    const isShortMixedCode =
      !element.printText &&
      text.length < 10 &&
      /[A-Z]/i.test(text) &&
      /\d/.test(text);
    if (code128Payload?.startCode === ":" && !code128Payload.hasInternalInvocations) {
      drawScaleX = 1.164;
    } else if (isShortMixedCode && /^[A-Z]{1,2}\d+$/i.test(text)) {
      options.text = `^B${text}`;
      options.parse = true;
    } else if (isShortMixedCode) {
      drawScaleX = 1.089;
    } else if (isNumeric) {
      if (hasHumanText) {
        options.includetext = false;
        separateHumanText = true;
        humanText = text;
      }
      options.text = `^B${text}`;
      options.parse = true;
      drawScaleX = Math.min(1.4, 1.1 + Math.max(text.length - 10, 0) * 0.027);
    }
  }
  if (element.barcodeType === "BQ") {
    options.scale = Math.max(toInt(element.rawParams?.[2], scale), 1);
    options.eclevel = qrPayload?.eclevel || "M";
    delete options.height;
    drawScaleX = 0.5;
    drawScaleY = 0.5;
  }
  if (element.barcodeType === "BX") {
    const zplModuleSize = Math.max(toFloat(element.rawParams?.[1], scale * 2), 1);
    options.scale = Math.max(zplModuleSize, 1);
    delete options.height;
    drawScaleX = 0.5;
    drawScaleY = 0.5;
  }

  try {
    const png = await bwipjs.toBuffer(options);
    const image = await loadImage(png);
    return { image, drawScaleX, drawScaleY, moduleWidth, separateHumanText, humanText };
  } catch (error) {
    warnings.push(`Barcode ${element.barcodeType} failed: ${error?.message || "render error"}.`);
    return null;
  }
};

const drawBarcode = async (ctx, element, barcodeDefault, warnings) => {
  const rendered = await renderBarcodeImage(element, barcodeDefault, warnings);
  if (!rendered) return;
  const {
    image,
    drawScaleX = 1,
    drawScaleY = 1,
    moduleWidth = 2,
    separateHumanText = false,
    humanText = null,
  } = rendered;
  const targetWidth = image.width * drawScaleX;
  let targetHeight = image.height * drawScaleY;
  let imageTargetHeight = targetHeight;
  let anchorHeight = targetHeight;
  if (isOneDimensionalBarcode(element.barcodeType)) {
    const barHeight = Math.max(element.height || 0, 1);
    targetHeight = barHeight;
    imageTargetHeight = barHeight;
    anchorHeight = barHeight;
    if (element.printText) {
      const humanTextHeight = Math.round(moduleWidth * 9.3);
      targetHeight += humanTextHeight;
      if (!separateHumanText) imageTargetHeight = targetHeight;
      if (element.textAbove) anchorHeight = targetHeight;
    }
  }
  const orientation = normalizeOrientation(element.orientation);
  const originY = element.originMode === "FT" && orientation === "N"
    ? (element.y || 0) - anchorHeight
    : element.y || 0;
  ctx.save();
  ctx.translate(element.x || 0, originY);
  if (orientation === "R") {
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(image, 0, -imageTargetHeight, targetWidth, imageTargetHeight);
  } else if (orientation === "I") {
    ctx.rotate(Math.PI);
    ctx.drawImage(image, -targetWidth, -imageTargetHeight, targetWidth, imageTargetHeight);
  } else if (orientation === "B") {
    ctx.rotate((Math.PI * 3) / 2);
    ctx.drawImage(image, -targetWidth, 0, targetWidth, imageTargetHeight);
  } else {
    ctx.drawImage(image, 0, 0, targetWidth, imageTargetHeight);
    if (separateHumanText && humanText) {
      const fontSize = Math.max(Math.round(moduleWidth * 9.6), 10);
      ctx.font = `${REGULAR_FONT_WEIGHT} ${fontSize}px ${BITMAP_FONT_FAMILY}`;
      ctx.fillStyle = "black";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(humanText, targetWidth / 2, imageTargetHeight + Math.round(moduleWidth * 2.2));
    }
  }
  ctx.restore();
};

const drawElement = async (ctx, element, parsed, barcodeDefault, warnings) => {
  if (element.type === "text") {
    drawText(ctx, element);
  } else if (element.type === "box") {
    drawBox(ctx, element);
  } else if (element.type === "circle") {
    drawCircle(ctx, element);
  } else if (element.type === "ellipse") {
    drawEllipse(ctx, element);
  } else if (element.type === "diagonal") {
    drawDiagonal(ctx, element);
  } else if (element.type === "graphicField") {
    drawGraphicField(ctx, element, warnings);
  } else if (element.type === "recallGraphic") {
    const resource = parsed.resources.get(element.name);
    if (!resource) {
      warnings.push(`Graphic resource not found: ${element.name}.`);
      return;
    }
    drawGraphicField(
      ctx,
      {
        ...resource,
        x: element.x,
        y: element.y,
        orientation: element.orientation,
        xScale: element.xScale,
        yScale: element.yScale,
      },
      warnings
    );
  } else if (element.type === "barcode") {
    await drawBarcode(ctx, element, barcodeDefault, warnings);
  }
};

const resolveCanvasDimension = (options, key, labelValue, physicalValue) => {
  const explicit = toInt(options[key], 0);
  if (explicit > 0) return explicit;
  if (options.useZplCanvas === true) return Math.max(labelValue || physicalValue || 1, 1);
  return Math.max(physicalValue || labelValue || 1, 1);
};

export const renderLabelToCanvas = async (label, parsed, options = {}) => {
  const width = resolveCanvasDimension(options, "width", label.width, label.physicalWidth);
  const height = resolveCanvasDimension(options, "height", label.height, label.physicalHeight);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const warnings = [...(label.warnings || [])];

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;

  const barcodeDefault = {
    moduleWidth: 2,
    ratio: 3,
    height: 100,
    ...(options.barcodeDefault || {}),
  };

  for (const element of label.elements) {
    await drawElement(ctx, element, parsed, barcodeDefault, warnings);
  }

  return { canvas, warnings };
};

export const renderZplToPngBuffer = async (zpl, options = {}) => {
  const parsed = parseZpl(zpl, options);
  if (!parsed.labels.length) {
    const error = new Error("No labels were found in ZPL payload.");
    error.code = "NO_LABELS";
    throw error;
  }

  const labelIndex = Math.max(toInt(options.labelIndex, 0), 0);
  const label = parsed.labels[labelIndex];
  if (!label) {
    const error = new Error(`Label index out of range. total=${parsed.labels.length} requested=${labelIndex}.`);
    error.code = "INVALID_LABEL_INDEX";
    throw error;
  }

  const { canvas, warnings } = await renderLabelToCanvas(label, parsed, options);
  const buffer = await canvas.encode("png");
  const labelsMetadata = parsed.labels.map((parsedLabel, index) => ({
    index,
    copies: parsedLabel.metadata?.copies || 1,
    printQuantity: parsedLabel.metadata?.printQuantity || null,
  }));
  return {
    buffer,
    warnings,
    width: canvas.width,
    height: canvas.height,
    labelCount: parsed.labels.length,
    metadata: {
      labelIndex,
      label: labelsMetadata[labelIndex],
      labels: labelsMetadata,
    },
  };
};

export const createLabel = ({ width = null, height = null, commands = [] } = {}) => ({
  width,
  height,
  commands: Array.isArray(commands) ? [...commands] : [],
});

export default {
  ZPLUMA_VERSION,
  createLabel,
  parseZpl,
  renderLabelToCanvas,
  renderZplToPngBuffer,
};
