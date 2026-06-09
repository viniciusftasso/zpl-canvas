import { renderZplToCanvas } from "../../src/index.js";
import "./styles.css";

const examples = [
  {
    name: "Shipping label",
    zpl: `^XA
^CF0,60
^FO50,50^GB100,100,100^FS
^FO75,75^FR^GB100,100,100^FS
^FO93,93^GB40,40,40^FS
^FO220,50^FDExample Logistics Co.^FS
^CF0,30
^FO220,115^FD100 Example Avenue^FS
^FO220,155^FDSample City ST 00000^FS
^FO220,195^FDUnited States (USA)^FS
^FO50,250^GB700,3,3^FS
^CFA,30
^FO50,300^FDAlex Example^FS
^FO50,340^FD200 Demo Street^FS
^FO50,380^FDPreview Town ST 11111^FS
^FO50,420^FDUnited States (USA)^FS
^CFA,15
^FO600,300^GB150,150,3^FS
^FO638,340^FDPermit^FS
^FO638,390^FD000000^FS
^FO50,500^GB700,3,3^FS
^BY5,2,270
^FO100,550^BC^FD00012345^FS
^FO50,900^GB700,250,3^FS
^FO400,900^GB3,250,3^FS
^CF0,40
^FO100,960^FDCtr. DEMO-1^FS
^FO100,1010^FDREF1 SAMPLE^FS
^FO100,1060^FDREF2 TEST^FS
^CF0,190
^FO470,955^FDST^FS
^XZ`,
  },
  {
    name: "Small item tag",
    zpl: `^XA
^PW480
^LL0320
^LS0
^FT55,82^A0N,34,26^FH\\^FDDEMO STORE^FS
^FT56,112^AAN,27,10^FH\\^FDSAMPLE PRODUCT: BLUE WIDGET^FS
^FT56,139^AAN,27,10^FH\\^FDPACK OF 2 UNITS - TEST ONLY^FS
^FT55,174^AAN,27,10^FH\\^FDSKU DEMO-001^FS
^BY2,3,60^FT55,243^BCN,,N,N
^FD>:TEST-8>0000001^FS
^FT55,269^AAN,27,10^FH\\^FDDEMO SHIP METHOD - TEST-8000001^FS
^XZ`,
  },
  {
    name: "Multi label",
    zpl: `^XA
^PW799
^FT535,98^A0N,37,33^FH\\^FDDEMO QUEUE^FS
^BY3,3,140^FT112,396^BCN,,Y,N
^FD>:TEST-0001-01^FS
^FT256,218^A0N,37,36^FH\\^FDdemo-store^FS
^FO1,112^GB798,0,2^FS
^FT75,98^A0N,50,50^FH\\^FDST-A01^FS
^XZ
^XA
^PW799
^FT535,98^A0N,37,33^FH\\^FDDEMO QUEUE^FS
^BY3,3,140^FT112,396^BCN,,Y,N
^FD>:TEST-0001-02^FS
^FT256,218^A0N,37,36^FH\\^FDdemo-store^FS
^FO1,112^GB798,0,2^FS
^FT75,98^A0N,50,50^FH\\^FDST-A02^FS
^XZ`,
  },
  {
    name: "QR and graphics",
    zpl: `^XA
^PW520
^LL520
^FO30,30^GB460,460,3^FS
^FO55,55^A0N,38,38^FDzpl-canvas^FS
^FO55,105^A0N,24,24^FDCanvas 2D browser preview^FS
^FO55,150^GB410,2,2^FS
^FO70,190^BQN,2,8^FDQA,https://www.npmjs.com/package/zpl-canvas^FS
^FO300,205^A0N,24,24^FB150,3,0,L^FDScan for package details^FS
^FO55,430^BY2,2,70^BCN,,Y,N^FD>:0000000000^FS
^XZ`,
  },
];

const elements = {
  exampleSelect: document.querySelector("#exampleSelect"),
  zplInput: document.querySelector("#zplInput"),
  dpmmInput: document.querySelector("#dpmmInput"),
  widthInput: document.querySelector("#widthInput"),
  heightInput: document.querySelector("#heightInput"),
  labelIndexInput: document.querySelector("#labelIndexInput"),
  useZplCanvasInput: document.querySelector("#useZplCanvasInput"),
  renderButton: document.querySelector("#renderButton"),
  downloadButton: document.querySelector("#downloadButton"),
  previewSurface: document.querySelector("#previewSurface"),
  statusText: document.querySelector("#statusText"),
  sizeText: document.querySelector("#sizeText"),
  labelCountText: document.querySelector("#labelCountText"),
  warningsOutput: document.querySelector("#warningsOutput"),
  metadataOutput: document.querySelector("#metadataOutput"),
};

let currentCanvas = null;
let renderTimer = null;
let renderSequence = 0;

const toNumber = (input, fallback) => {
  const value = Number(input.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const setStatus = (message, kind = "ready") => {
  elements.statusText.textContent = message;
  elements.statusText.style.color = kind === "error" ? "var(--danger)" : "";
};

const setPreviewContent = (node) => {
  elements.previewSurface.replaceChildren(node);
};

const render = async () => {
  const sequence = ++renderSequence;
  setStatus("Rendering");
  elements.renderButton.disabled = true;

  try {
    const result = await renderZplToCanvas(elements.zplInput.value, {
      dpmm: toNumber(elements.dpmmInput, 8),
      labelWidthMm: toNumber(elements.widthInput, 101.6),
      labelHeightMm: toNumber(elements.heightInput, 152.4),
      labelIndex: Math.max(Number(elements.labelIndexInput.value) || 0, 0),
      useZplCanvas: elements.useZplCanvasInput.checked,
    });

    if (sequence !== renderSequence) return;

    currentCanvas = result.canvas;
    currentCanvas.setAttribute("aria-label", "Rendered ZPL label");
    setPreviewContent(currentCanvas);
    elements.downloadButton.disabled = false;
    elements.sizeText.textContent = `${result.width} x ${result.height}px`;
    elements.labelCountText.textContent = `${result.labelCount} label${result.labelCount === 1 ? "" : "s"}`;
    elements.warningsOutput.textContent = JSON.stringify(result.warnings, null, 2);
    elements.metadataOutput.textContent = JSON.stringify(result.metadata, null, 2);
    setStatus(result.warnings.length ? "Rendered with warnings" : "Rendered");
  } catch (error) {
    if (sequence !== renderSequence) return;

    currentCanvas = null;
    elements.downloadButton.disabled = true;
    elements.sizeText.textContent = "";
    elements.labelCountText.textContent = "";
    elements.warningsOutput.textContent = "[]";
    elements.metadataOutput.textContent = "{}";
    setPreviewContent(Object.assign(document.createElement("div"), {
      className: "error-state",
      textContent: error?.message || "Render failed.",
    }));
    setStatus("Render failed", "error");
  } finally {
    if (sequence === renderSequence) elements.renderButton.disabled = false;
  }
};

const scheduleRender = () => {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, 350);
};

const downloadCanvas = async () => {
  if (!currentCanvas) return;
  const blob = await new Promise((resolve) => currentCanvas.toBlob(resolve, "image/png"));
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "zpl-canvas-label.png";
  anchor.click();
  URL.revokeObjectURL(url);
};

examples.forEach((example, index) => {
  const option = document.createElement("option");
  option.value = String(index);
  option.textContent = example.name;
  elements.exampleSelect.append(option);
});

elements.exampleSelect.addEventListener("change", () => {
  elements.zplInput.value = examples[Number(elements.exampleSelect.value)].zpl;
  elements.labelIndexInput.value = "0";
  render();
});

[
  elements.zplInput,
  elements.dpmmInput,
  elements.widthInput,
  elements.heightInput,
  elements.labelIndexInput,
].forEach((element) => element.addEventListener("input", scheduleRender));

elements.useZplCanvasInput.addEventListener("change", render);
elements.renderButton.addEventListener("click", render);
elements.downloadButton.addEventListener("click", downloadCanvas);

elements.zplInput.value = examples[0].zpl;
elements.downloadButton.disabled = true;
setPreviewContent(Object.assign(document.createElement("div"), {
  className: "empty-state",
  textContent: "Render a label to preview it here.",
}));
render();
