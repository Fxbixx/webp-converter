import JSZip from 'https://esm.sh/jszip@3.10.1';
import encodeWebp from 'https://esm.sh/@jsquash/webp@1.5.0/encode?bundle';

const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const convertBtn = document.getElementById('convertBtn');
const sourcePreview = document.getElementById('sourcePreview');
const resultPreview = document.getElementById('resultPreview');
const sourceMeta = document.getElementById('sourceMeta');
const resultMeta = document.getElementById('resultMeta');
const resultList = document.getElementById('resultList');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const modeInput = document.getElementById('mode');
const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const keepAspectInput = document.getElementById('keepAspect');
const qualityInput = document.getElementById('quality');
const qualityValue = document.getElementById('qualityValue');
const statusPill = document.getElementById('statusPill');

let sourceFiles = [];
let preparedImages = [];
let resultFiles = [];
let sourceUrl = null;
let resultUrl = null;

qualityInput.addEventListener('input', () => {
  qualityValue.textContent = qualityInput.value;
});

fileInput.addEventListener('change', (event) => {
  const files = [...event.target.files];
  if (files.length) loadFiles(files);
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (event) => {
  const files = [...(event.dataTransfer.files || [])].filter((file) => file.type.startsWith('image/'));
  if (files.length) loadFiles(files);
});

convertBtn.addEventListener('click', convertImages);
downloadAllBtn.addEventListener('click', downloadAllAsZip);

function setStatus(text, ready = false) {
  statusPill.textContent = text;
  statusPill.className = `status ${ready ? 'ready' : 'idle'}`;
}

async function loadFiles(files) {
  sourceFiles = files.filter((file) => file.type.startsWith('image/'));
  preparedImages = [];
  resultFiles = [];
  convertBtn.disabled = sourceFiles.length === 0;
  downloadAllBtn.classList.add('disabled');
  resultList.className = 'result-list empty';
  resultList.textContent = 'Noch keine Dateien konvertiert';

  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  if (resultUrl) URL.revokeObjectURL(resultUrl);

  const firstFile = sourceFiles[0];
  sourceUrl = URL.createObjectURL(firstFile);
  sourcePreview.src = sourceUrl;
  sourcePreview.style.display = 'block';
  resultPreview.style.display = 'none';
  resultPreview.removeAttribute('src');

  for (const file of sourceFiles) {
    const bitmap = await createImageBitmap(file);
    preparedImages.push({ file, bitmap });
  }

  const firstBitmap = preparedImages[0].bitmap;
  sourceMeta.textContent = `${sourceFiles.length} Bild${sourceFiles.length > 1 ? 'er' : ''} geladen · Erstes Bild: ${firstBitmap.width}×${firstBitmap.height} · ${formatBytes(firstFile.size)}`;
  resultMeta.textContent = 'Bereit zur echten WebP-Konvertierung';
  setStatus(`${sourceFiles.length} Bild${sourceFiles.length > 1 ? 'er' : ''} geladen`, true);
}

function getDimensions(bitmap) {
  const targetWidth = Math.max(1, Number(widthInput.value) || 750);
  const hasManualHeight = Number(heightInput.value) > 0;
  const keepAspect = keepAspectInput.checked;
  let targetHeight = hasManualHeight ? Math.max(1, Number(heightInput.value)) : null;

  if (!targetHeight && keepAspect) {
    targetHeight = Math.round((bitmap.height / bitmap.width) * targetWidth);
  }
  if (!targetHeight) targetHeight = targetWidth;

  return { targetWidth, targetHeight };
}

async function convertImages() {
  if (!preparedImages.length) return;

  resultFiles = [];
  resultList.className = 'result-list';
  resultList.innerHTML = '';
  setStatus('Konvertiere zu echtem WebP …', false);

  for (let index = 0; index < preparedImages.length; index++) {
    const { file, bitmap } = preparedImages[index];
    const { targetWidth, targetHeight } = getDimensions(bitmap);
    const mode = modeInput.value;
    const quality = Number(qualityInput.value);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.clearRect(0, 0, targetWidth, targetHeight);

    drawToCanvas(ctx, bitmap, targetWidth, targetHeight, mode);
    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

    const encoded = await encodeWebp(imageData, { quality });
    const blob = new Blob([encoded], { type: 'image/webp' });

    const name = `${stripExtension(file.name)}-${targetWidth}x${targetHeight}.webp`;
    const url = URL.createObjectURL(blob);
    resultFiles.push({ name, blob, url, width: targetWidth, height: targetHeight, source: file.name });

    if (index === 0) {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = url;
      resultPreview.src = resultUrl;
      resultPreview.style.display = 'block';
      resultMeta.textContent = `${targetWidth}×${targetHeight} · ${formatBytes(blob.size)} · echte WebP-Datei`;
    }

    appendResultItem(name, blob.size, targetWidth, targetHeight, url, file.name);
  }

  downloadAllBtn.classList.remove('disabled');
  setStatus(`${resultFiles.length} echte WebP-Datei${resultFiles.length > 1 ? 'en' : ''} fertig`, true);
}

function drawToCanvas(ctx, bitmap, targetWidth, targetHeight, mode) {
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  if (mode === 'stretch') {
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    return;
  }

  if (mode === 'contain') {
    const scale = Math.min(targetWidth / srcW, targetHeight / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const dx = (targetWidth - drawW) / 2;
    const dy = (targetHeight - drawH) / 2;
    ctx.drawImage(bitmap, dx, dy, drawW, drawH);
    return;
  }

  const scale = Math.max(targetWidth / srcW, targetHeight / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const dx = (targetWidth - drawW) / 2;
  const dy = (targetHeight - drawH) / 2;
  ctx.drawImage(bitmap, dx, dy, drawW, drawH);
}

function appendResultItem(name, bytes, width, height, url, sourceName) {
  if (resultList.classList.contains('empty')) resultList.classList.remove('empty');
  const item = document.createElement('div');
  item.className = 'result-item';
  item.innerHTML = `
    <div>
      <div class="result-title">${name}</div>
      <div class="result-sub">Aus ${sourceName} · ${width}×${height} · ${formatBytes(bytes)}</div>
    </div>
    <a class="result-link" href="${url}" download="${name}">Download</a>
  `;
  resultList.appendChild(item);
}

async function downloadAllAsZip() {
  if (!resultFiles.length) return;
  const zip = new JSZip();
  resultFiles.forEach(({ name, blob }) => zip.file(name, blob));
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipUrl = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = zipUrl;
  link.download = 'pixelpress-webp-export.zip';
  link.click();
  setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
}

function stripExtension(name) {
  return name.replace(/(\.[^.]+)+$/, '');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i++) {
    value /= 1024;
    unit = units[i];
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${unit}`.replace('.0 ', ' ');
}
