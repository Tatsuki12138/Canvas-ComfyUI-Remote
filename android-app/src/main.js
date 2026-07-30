import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  autocompleteDanbooru,
  comfyStatus,
  deleteJob,
  generate,
  getDanbooruImage,
  getExternalApiKey,
  getImage,
  getJob,
  jobImageUrl,
  getOriginalImage,
  health,
  interrogateTags,
  listCheckpoints,
  listJobImages,
  listLoras,
  loadConfig,
  normalizeTags,
  pair,
  restartComfy,
  rotateExternalApiKey,
  searchDanbooru,
  session,
  startComfy,
  stopComfy,
} from './api.js';
import {
  PROMPT_STORE_KEY,
  emptyModuleData,
  importBatchItems,
  loadPromptStore,
  parseBatchImport,
  savePromptStore,
} from './prompt-store.js';
import './styles.css';

const CanvasMedia = registerPlugin('CanvasMedia');
const app = document.querySelector('#app');

const EMPTY_MODULE_LINE = ', ';
const LORA_STORAGE = 'canvas.lora.stack.v2';
const WORKFLOW_STORAGE = 'canvas.workflow.v1';
const CHECKPOINT_STORAGE = 'canvas.checkpoint.v2';
const LEGACY_CHECKPOINT_STORAGE = 'canvas.checkpoint.v1';
const NEGATIVE_STORAGE = 'canvas.negative.byWorkflow.v1';
const BACKUP_KEYS = [PROMPT_STORE_KEY, LORA_STORAGE, WORKFLOW_STORAGE, CHECKPOINT_STORAGE, NEGATIVE_STORAGE];
const DANBOORU_LIMIT = 40;
const THUMB_CONCURRENCY = 8;
const initialPromptStore = loadPromptStore();
const TAG_CATEGORY_LABELS = {
  0: 'General',
  1: 'Artist',
  3: 'IP',
  4: 'Character',
  5: 'Meta',
};

let danbooruAutocompleteTimer = null;
let danbooruAutocompleteSeq = 0;
let danbooruThumbRun = 0;
let danbooruSelectRun = 0;
const danbooruSearchCache = new Map();
const danbooruAutocompleteCache = new Map();
const danbooruThumbBlobCache = new Map();
const DANBOORU_THUMB_CACHE_MAX = 120;

const icons = {
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.55 5.45L19 9l-5.45 1.55L12 16l-1.55-5.45L5 9l5.45-1.55L12 2Z"/><path d="M18.5 15l.75 2.25L21.5 18l-2.25.75L18.5 21l-.75-2.25L15.5 18l2.25-.75L18.5 15Z"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.86 1.86-.06-.06A1.7 1.7 0 0 0 16 18.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V20h-2.6v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.88.34l-.06.06-1.86-1.86.06-.06A1.7 1.7 0 0 0 7.5 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H5.7V11h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.34-1.88L7 7.96 8.86 6.1l.06.06A1.7 1.7 0 0 0 10.8 6.5a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V4.7h2.6v.1a1.7 1.7 0 0 0 1.1 1.6 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.86 1.86-.06.06A1.7 1.7 0 0 0 19.3 9.8a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v2.6H21a1.7 1.7 0 0 0-1.6 1.2Z"/></svg>',
};

const state = {
  config: null,
  activeTab: 'generate',
  workflows: [],
  selectedWorkflow: '',
  settingsInitialized: false,
  settings: {
    width: 1024,
    height: 1024,
    steps: 28,
    cfg: 6,
    samplerName: 'euler_ancestral',
    scheduler: 'normal',
    hiresSteps: 15,
    hiresCfg: 7,
    hiresDenoise: 0.6,
    hiresSamplerName: 'euler_ancestral',
    hiresScheduler: 'normal',
    seed: -1,
    negative: '',
  },
  moduleDefinitions: initialPromptStore.definitions,
  promptSeeds: initialPromptStore.seeds,
  modules: initialPromptStore.modules,
  checkpoints: [],
  checkpointsLoaded: false,
  checkpointsWorkflowId: '',
  selectedCheckpoint: null,
  loras: [],
  lorasLoaded: false,
  loraSearch: '',
  selectedLoras: null,
  gallery: [],
  activeGalleryId: '',
  generating: false,
  generationStartedAt: 0,
  currentJobId: '',
  progress: { value: 0, label: 'Idle' },
  resultRetry: null,
  danbooru: {
    query: '',
    page: 1,
    loading: false,
    posts: [],
    hasMore: false,
    selected: null,
    selectedBlob: null,
    selectedObjectUrl: '',
    tagOutput: '',
    rawTagOutput: '',
    tagging: false,
    tagError: '',
    error: '',
    suggestions: [],
    suggestQuery: '',
    suggestLoading: false,
    savingOriginal: false,
  },
  comfy: null,
  comfyBusy: false,
  comfyAction: '',
  tagger: null,
  apiKey: null,
  apiKeyLoading: false,
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serverHost() {
  try {
    return new URL(session.server).hostname;
  } catch {
    return session.server.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}

function showToast(message, tone = 'neutral') {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value < 60) return `${value.toFixed(1)}s`;
  return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
}

function imageExtension(blob, fallback = 'png') {
  const type = blob?.type || '';
  if (type.includes('jpeg')) return 'jpg';
  if (type.includes('webp')) return 'webp';
  if (type.includes('png')) return 'png';
  if (type.includes('gif')) return 'gif';
  return fallback;
}

function mimeTypeForExtension(extension = 'png') {
  const normalized = String(extension || '').toLowerCase().replace(/^\./, '');
  if (normalized === 'jpg' || normalized === 'jpeg') return 'image/jpeg';
  if (normalized === 'webp') return 'image/webp';
  if (normalized === 'gif') return 'image/gif';
  return 'image/png';
}

function extensionFromUrl(url, fallback = 'png') {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    return match?.[1]?.toLowerCase() || fallback;
  } catch {
    return fallback;
  }
}

function saveModules() {
  const saved = savePromptStore({
    definitions: state.moduleDefinitions,
    modules: state.modules,
    seeds: state.promptSeeds,
  });
  state.moduleDefinitions = saved.definitions;
  state.modules = saved.modules;
  state.promptSeeds = saved.seeds;
}

function backupPayload() {
  const storage = {};
  for (const key of BACKUP_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) storage[key] = value;
  }
  return {
    format: 'canvas-app-backup',
    version: 1,
    exported_at: new Date().toISOString(),
    storage,
  };
}

function utf8Base64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function exportAppBackup() {
  const text = JSON.stringify(backupPayload(), null, 2);
  const filename = `canvas-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (Capacitor.isNativePlatform()) {
    const result = await Filesystem.writeFile({
      path: filename,
      data: utf8Base64(text),
      directory: Directory.Cache,
    });
    await Share.share({ title: 'Canvas backup', url: result.uri, dialogTitle: 'Save or share Canvas backup' });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importAppBackup(file) {
  const backup = JSON.parse(await file.text());
  if (backup?.format !== 'canvas-app-backup' || backup.version !== 1 || !backup.storage) {
    throw new Error('This is not a supported Canvas backup.');
  }
  for (const key of BACKUP_KEYS) {
    const value = backup.storage[key];
    if (typeof value === 'string') localStorage.setItem(key, value);
  }
  loadPromptStore();
}

function loadSelectedLoras(defaultLoras = []) {
  const raw = localStorage.getItem(LORA_STORAGE);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return defaultLoras.map((item) => ({
    name: item.name,
    weight: Number(item.weight ?? 1),
    text_encoder_weight: Number(item.text_encoder_weight ?? item.weight ?? 1),
  }));
}

function saveSelectedLoras() {
  localStorage.setItem(LORA_STORAGE, JSON.stringify(state.selectedLoras || []));
}

function selectedWorkflowId() {
  return state.selectedWorkflow || state.config?.default_workflow || state.workflows[0]?.id || 'anima_base';
}

function currentWorkflow() {
  const id = selectedWorkflowId();
  return state.workflows.find((item) => item.id === id) || state.workflows[0] || null;
}

function currentWorkflowLabel() {
  return currentWorkflow()?.label || selectedWorkflowId();
}

function isHiresWorkflow() {
  return Boolean(currentWorkflow()?.features?.includes('hires'));
}

function defaultCheckpointForWorkflow() {
  const workflow = currentWorkflow();
  return workflow?.default_checkpoint || (selectedWorkflowId() === state.config?.default_workflow ? state.config?.default_checkpoint : null);
}

function loadSelectedWorkflow(defaultWorkflow) {
  const saved = localStorage.getItem(WORKFLOW_STORAGE);
  const ids = new Set(state.workflows.map((item) => item.id));
  if (saved && ids.has(saved)) return saved;
  if (defaultWorkflow && ids.has(defaultWorkflow)) return defaultWorkflow;
  return state.workflows[0]?.id || defaultWorkflow || 'anima_base';
}

function saveSelectedWorkflow() {
  if (state.selectedWorkflow) localStorage.setItem(WORKFLOW_STORAGE, state.selectedWorkflow);
  else localStorage.removeItem(WORKFLOW_STORAGE);
}

function checkpointStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHECKPOINT_STORAGE) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  return {};
}

function loadSelectedCheckpoint(defaultCheckpoint, workflowId = selectedWorkflowId()) {
  const saved = checkpointStore()[workflowId];
  if (saved) return saved;
  if (workflowId === (state.config?.default_workflow || 'anima_base')) {
    const legacy = localStorage.getItem(LEGACY_CHECKPOINT_STORAGE);
    if (legacy) return legacy;
  }
  return defaultCheckpoint?.name || '';
}

function saveSelectedCheckpoint() {
  const store = checkpointStore();
  const workflowId = selectedWorkflowId();
  if (state.selectedCheckpoint) store[workflowId] = state.selectedCheckpoint;
  else delete store[workflowId];
  localStorage.setItem(CHECKPOINT_STORAGE, JSON.stringify(store));
}

function negativeStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NEGATIVE_STORAGE) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  return {};
}

function loadNegativePrompt(workflowId = selectedWorkflowId()) {
  return negativeStore()[workflowId] || '';
}

function saveNegativePrompt(workflowId = selectedWorkflowId(), value = state.settings.negative) {
  const store = negativeStore();
  if (value) store[workflowId] = value;
  else delete store[workflowId];
  localStorage.setItem(NEGATIVE_STORAGE, JSON.stringify(store));
}

function samplerOptions() {
  return state.config?.sampler_options || ['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_sde', 'uni_pc', 'er_sde'];
}

function schedulerOptions() {
  return state.config?.scheduler_options || ['normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform'];
}

function selectOptionsHtml(options, selected) {
  const values = [...new Set([selected, ...options].filter(Boolean))];
  return values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
}

function applyWorkflowDefaults(workflow = currentWorkflow()) {
  const defaults = workflow?.defaults || state.config?.defaults || {};
  if (defaults.width) state.settings.width = Number(defaults.width);
  if (defaults.height) state.settings.height = Number(defaults.height);
  if (defaults.steps) state.settings.steps = Number(defaults.steps);
  if (defaults.cfg !== undefined) state.settings.cfg = Number(defaults.cfg);
  if (defaults.sampler_name !== undefined) state.settings.samplerName = String(defaults.sampler_name);
  if (defaults.scheduler !== undefined) state.settings.scheduler = String(defaults.scheduler);
  if (defaults.hires_steps !== undefined) state.settings.hiresSteps = Number(defaults.hires_steps);
  if (defaults.hires_cfg !== undefined) state.settings.hiresCfg = Number(defaults.hires_cfg);
  if (defaults.hires_denoise !== undefined) state.settings.hiresDenoise = Number(defaults.hires_denoise);
  if (defaults.hires_sampler_name !== undefined) state.settings.hiresSamplerName = String(defaults.hires_sampler_name);
  if (defaults.hires_scheduler !== undefined) state.settings.hiresScheduler = String(defaults.hires_scheduler);
  if (defaults.seed !== undefined) state.settings.seed = Number(defaults.seed);
}

function switchWorkflow(workflowId) {
  if (!workflowId || workflowId === state.selectedWorkflow) return;
  saveNegativePrompt();
  state.selectedWorkflow = workflowId;
  saveSelectedWorkflow();
  applyWorkflowDefaults();
  state.settings.negative = loadNegativePrompt(workflowId);
  state.checkpoints = [];
  state.checkpointsLoaded = false;
  state.checkpointsWorkflowId = '';
  state.selectedCheckpoint = loadSelectedCheckpoint(defaultCheckpointForWorkflow(), workflowId);
  showToast(`${currentWorkflowLabel()} selected`);
  renderActiveTab();
}

function moduleText(moduleId) {
  const data = state.modules[moduleId] || { items: [], selectedIds: [], draft: '' };
  const selectedIds = Array.isArray(data.selectedIds) ? data.selectedIds : (data.selectedId ? [data.selectedId] : []);
  const selected = selectedIds
    .map((id) => data.items.find((item) => item.id === id)?.content?.trim())
    .filter(Boolean);
  const manual = data.draft?.trim();
  if (manual) selected.push(manual);
  return selected.join(', ');
}

function finalPrompt() {
  return state.moduleDefinitions
    .map((module) => moduleText(module.id) || EMPTY_MODULE_LINE)
    .join('\n\n');
}

function hasPromptContent() {
  return state.moduleDefinitions.some((module) => moduleText(module.id).trim());
}

function selectedSize() {
  return { width: state.settings.width, height: state.settings.height };
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function saveBlobToGallery(blob, filename = `canvas-${Date.now()}.png`) {
  if (!blob) return;
  try {
    if (Capacitor.isNativePlatform()) {
      const data = await blobToBase64(blob);
      try {
        await CanvasMedia.saveImage({ data, filename, album: 'Canvas', mimeType: blob.type || 'image/png' });
        showToast('Saved to Photos / Canvas');
        return;
      } catch (nativeError) {
        const written = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
        await Share.share({ title: 'Save Canvas image', files: [written.uri], dialogTitle: 'Save or share image' });
        showToast('Opened system share sheet');
        console.warn(nativeError);
        return;
      }
    }
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    showToast(`Cannot save: ${error.message}`, 'error');
  }
}

async function saveGalleryEntry(item) {
  if (!item) return;
  if (item.blob && !item.previewOnly) return saveBlobToGallery(item.blob, item.filename);
  if (!item.jobId && item.displayUrl) return showToast('This image is preview-only.', 'error');
  if (Capacitor.isNativePlatform() && item.accessToken) {
    try {
      showToast('Saving original image…');
      await CanvasMedia.saveImageFromUrl({
        url: jobImageUrl(item.jobId, item.index || 0, 'original', item.accessToken),
        filename: item.filename,
        album: 'Canvas',
        mimeType: mimeTypeForExtension(item.meta?.originalExtension || item.filename.split('.').pop()),
      });
      item.previewOnly = false;
      showToast('Saved to Photos / Canvas');
      return;
    } catch (nativeError) {
      console.warn('Native streaming save failed; falling back to browser download.', nativeError);
    }
  }
  try {
    showToast('Downloading original image…');
    const blob = await getOriginalImage(item.jobId, item.index || 0);
    const oldObjectUrl = item.objectUrl;
    item.blob = blob;
    item.objectUrl = URL.createObjectURL(blob);
    item.previewOnly = false;
    item.loaded = true;
    item.filename = item.filename.replace(/\.[^.]+$/, `.${imageExtension(blob)}`);
    if (oldObjectUrl) URL.revokeObjectURL(oldObjectUrl);
    await saveBlobToGallery(blob, item.filename);
    if (['generate', 'gallery'].includes(state.activeTab)) renderActiveTab();
  } catch (error) {
    showToast(`Cannot save original: ${error.message}`, 'error');
  }
}

function addGalleryImage({ jobId, index, blob = null, displayUrl = '', accessToken = '', timing = {}, meta = {} }) {
  const id = uid('img');
  const objectUrl = blob ? URL.createObjectURL(blob) : '';
  const extension = meta.originalExtension || imageExtension(blob);
  state.gallery.unshift({
    id,
    jobId,
    index,
    blob,
    objectUrl,
    displayUrl,
    accessToken,
    previewOnly: Boolean(meta.previewOnly),
    loaded: false,
    loadError: false,
    previewFallbackStarted: false,
    startedAt: timing.startedAt || 0,
    generationSeconds: timing.generationSeconds,
    totalSeconds: timing.totalSeconds || null,
    prepareSeconds: timing.prepareSeconds,
    displaySizeBytes: meta.displaySizeBytes,
    originalSizeBytes: meta.originalSizeBytes,
    meta,
    createdAt: Date.now(),
    filename: `canvas-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`,
  });
  state.activeGalleryId = id;
}

function imageSrc(item) {
  return item?.objectUrl || item?.displayUrl || '';
}

function markGalleryImageLoaded(id) {
  const item = state.gallery.find((entry) => entry.id === id);
  if (!item || item.loaded) return;
  item.loaded = true;
  item.loadError = false;
  if (!item.totalSeconds && item.startedAt) {
    item.totalSeconds = (performance.now() - item.startedAt) / 1000;
  }
  if (state.activeGalleryId === id && ['generate', 'gallery'].includes(state.activeTab)) {
    renderActiveTab();
  }
}

function attachImageLoadHandlers() {
  document.querySelectorAll('[data-gallery-load]').forEach((image) => {
    const id = image.dataset.galleryLoad;
    if (image.complete && image.naturalWidth > 0) {
      queueMicrotask(() => markGalleryImageLoaded(id));
      return;
    }
    image.addEventListener('load', () => markGalleryImageLoaded(id), { once: true });
    image.addEventListener('error', async () => {
      const item = state.gallery.find((entry) => entry.id === id);
      if (!item || item.previewFallbackStarted) return;
      item.previewFallbackStarted = true;
      try {
        const blob = await getImage(item.jobId, item.index || 0);
        if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
        item.blob = blob;
        item.objectUrl = URL.createObjectURL(blob);
        item.loadError = false;
        item.previewFallbackStarted = false;
        renderActiveTab();
      } catch (error) {
        item.loadError = true;
        item.previewFallbackStarted = false;
        showToast(`Preview image failed: ${error.message}`, 'error');
      }
    }, { once: true });
  });
}

function removeGalleryImage(id) {
  const item = state.gallery.find((entry) => entry.id === id);
  if (!item) return;
  if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
  state.gallery = state.gallery.filter((entry) => entry.id !== id);
  if (!state.gallery.some((entry) => entry.jobId === item.jobId)) {
    deleteJob(item.jobId).catch(() => {});
  }
  if (state.activeGalleryId === id) state.activeGalleryId = state.gallery[0]?.id || '';
  renderActiveTab();
}

function timingHtml(item) {
  if (!item) return '';
  return `
    <div class="time-strip">
      <span>Generation <b>${formatDuration(item.generationSeconds)}</b></span>
      <span>Total <b>${item.totalSeconds ? formatDuration(item.totalSeconds) : 'loading…'}</b></span>
    </div>`;
}

function setupView() {
  app.innerHTML = `
    <main class="setup-shell">
      <section class="setup-card">
        <div class="mark">${icons.spark}</div>
        <p class="eyebrow">Private Connection</p>
        <h1>Canvas</h1>
        <form id="pair-form">
          <label>Gateway URL<input id="server" type="url" value="${escapeHtml(session.server)}" autocomplete="off" spellcheck="false" placeholder="http://your-pc.ts.net:3001" required /></label>
          <label>Pairing Code<input id="code" type="text" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" placeholder="00000000" autocomplete="one-time-code" /></label>
          <button class="primary" type="submit">Connect</button>
        </form>
      </section>
    </main>`;
  document.querySelector('#pair-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    button.textContent = 'Connecting…';
    try {
      await pair(document.querySelector('#server').value.trim(), document.querySelector('#code').value.trim());
      await renderMain();
    } catch (error) {
      showToast(error.message, 'error');
      button.disabled = false;
      button.textContent = 'Connect';
    }
  });
}

async function renderMain() {
  try {
    state.config = await loadConfig();
    state.workflows = Array.isArray(state.config.workflows) ? state.config.workflows.filter((item) => item?.id) : [];
    state.selectedWorkflow = loadSelectedWorkflow(state.config.default_workflow);
    if (!state.settingsInitialized) {
      applyWorkflowDefaults();
      state.settings.negative = loadNegativePrompt();
      state.settingsInitialized = true;
    }
    if (state.selectedLoras === null) state.selectedLoras = loadSelectedLoras(state.config.default_loras || []);
    if (state.selectedCheckpoint === null) state.selectedCheckpoint = loadSelectedCheckpoint(defaultCheckpointForWorkflow());
  } catch (error) {
    if (!session.token) return setupView();
    showToast(error.message, 'error');
    return setupView();
  }
  app.innerHTML = `
    <main class="main-shell">
      <header>
        <div><p class="eyebrow">Local GPU Node</p><h1>Canvas Pro <small>v${escapeHtml(state.config.version || '0.4.0')}</small></h1></div>
        <button id="quick-settings" class="icon-button" aria-label="Settings">${icons.settings}</button>
      </header>
      <section id="view" class="view-shell"></section>
      <nav class="tabs-nav">
        ${[
          ['generate', 'Create'],
          ['gallery', 'Gallery'],
          ['lora', 'Models'],
          ['prompt', 'Prompt'],
          ['danbooru', 'Search'],
        ].map(([id, label]) => `<button class="${state.activeTab === id ? 'active' : ''}" data-tab="${id}" type="button">${label}</button>`).join('')}
      </nav>
    </main>`;
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });
  document.querySelector('#quick-settings').addEventListener('click', () => switchTab('settings'));
  renderActiveTab();
}

function switchTab(tab) {
  if (!tab || tab === state.activeTab) return;
  if (state.activeTab === 'danbooru' && tab !== 'danbooru') {
    danbooruThumbRun += 1;
  }
  state.activeTab = tab;
  updateTabNav();
  renderActiveTab();
}

function updateTabNav() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === state.activeTab);
  });
}

function renderGenerateIfVisible() {
  if (state.activeTab === 'generate') renderActiveTab();
}

function updateProgressIfVisible() {
  if (state.activeTab !== 'generate') return;
  const ring = document.querySelector('.progress-ring i');
  const percent = document.querySelector('.progress-ring span');
  const label = document.querySelector('.status-text');
  if (!ring || !percent || !label) return;
  ring.style.setProperty('--p', String(state.progress.value));
  percent.textContent = `${state.progress.value}%`;
  label.textContent = state.progress.label;
}

function renderActiveTab() {
  const view = document.querySelector('#view');
  if (!view) return;
  if (state.activeTab === 'generate') return renderGenerate(view);
  if (state.activeTab === 'gallery') return renderGallery(view);
  if (state.activeTab === 'lora') return renderLora(view);
  if (state.activeTab === 'prompt') return renderPromptModules(view);
  if (state.activeTab === 'danbooru') return renderDanbooru(view);
  if (state.activeTab === 'settings') return renderSettings(view);
}

async function ensureCheckpointsLoaded() {
  const workflowId = selectedWorkflowId();
  if (state.checkpointsLoaded && state.checkpointsWorkflowId === workflowId) return;
  try {
    const body = await listCheckpoints(workflowId);
    if (workflowId !== selectedWorkflowId()) return;
    state.checkpoints = body.items || [];
    state.checkpointsLoaded = true;
    state.checkpointsWorkflowId = body.workflow_id || workflowId;
    const names = new Set(state.checkpoints.map((item) => item.name));
    const saved = loadSelectedCheckpoint(body.default || defaultCheckpointForWorkflow(), workflowId);
    if (!state.selectedCheckpoint || state.selectedCheckpoint !== saved || (names.size && !names.has(state.selectedCheckpoint))) {
      state.selectedCheckpoint = (names.has(saved) ? saved : '') || body.default?.name || defaultCheckpointForWorkflow()?.name || state.checkpoints[0]?.name || '';
      saveSelectedCheckpoint();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function workflowSelectHtml(id = 'workflow') {
  if (!state.workflows.length) {
    return `<select id="${id}" data-workflow-select disabled><option>No workflows found</option></select>`;
  }
  return `
    <select id="${id}" data-workflow-select>
      ${state.workflows.map((item) => `
        <option value="${escapeHtml(item.id)}" ${item.id === selectedWorkflowId() ? 'selected' : ''}>
          ${escapeHtml(item.label || item.id)}
        </option>
      `).join('')}
    </select>`;
}

function checkpointSelectHtml(id = 'checkpoint') {
  const selected = state.selectedCheckpoint || defaultCheckpointForWorkflow()?.name || '';
  if (!state.checkpointsLoaded) {
    return `<select id="${id}" data-checkpoint-select disabled><option>Loading models…</option></select>`;
  }
  if (!state.checkpoints.length) {
    return `<select id="${id}" data-checkpoint-select disabled><option>No base models found</option></select>`;
  }
  return `
    <select id="${id}" data-checkpoint-select>
      ${state.checkpoints.map((item) => `
        <option value="${escapeHtml(item.name)}" ${item.name === selected ? 'selected' : ''}>
          ${escapeHtml(item.name)}${item.folder ? ` · ${escapeHtml(item.folder)}` : ''}
        </option>
      `).join('')}
    </select>`;
}

function attachWorkflowHandlers() {
  document.querySelectorAll('[data-workflow-select]').forEach((select) => {
    select.addEventListener('change', () => switchWorkflow(select.value));
  });
}

function attachCheckpointHandlers() {
  document.querySelectorAll('[data-checkpoint-select]').forEach((select) => {
    select.addEventListener('change', () => {
      state.selectedCheckpoint = select.value;
      saveSelectedCheckpoint();
      showToast('Base model selected');
    });
  });
}

function renderGenerate(view) {
  if (!state.checkpointsLoaded || state.checkpointsWorkflowId !== selectedWorkflowId()) {
    ensureCheckpointsLoaded().then(() => {
      if (state.activeTab === 'generate') renderActiveTab();
    });
  }
  const active = state.gallery.find((item) => item.id === state.activeGalleryId);
  const retry = state.resultRetry;
  const presets = state.config?.presets || [
    { label: 'Portrait', width: 768, height: 1024 },
    { label: 'Square', width: 1024, height: 1024 },
    { label: 'Landscape', width: 1024, height: 768 },
  ];
  const workflow = currentWorkflow();
  const hires = isHiresWorkflow();
  view.innerHTML = `
    <section id="result" class="result ${active ? 'complete' : state.generating ? 'loading' : retry ? 'error' : 'empty'}">
      ${state.generating ? `
        <div class="progress-ring"><i style="--p:${state.progress.value}"></i><span>${state.progress.value}%</span></div>
        <p class="status-text">${escapeHtml(state.progress.label)}</p>
      ` : active ? `
        <img src="${imageSrc(active)}" data-gallery-load="${active.id}" alt="Generated result" />
        <div class="result-actions">
          <div>
            <span>Session ${state.gallery.length}</span>
            ${timingHtml(active)}
          </div>
          <button id="save-active" class="secondary-btn">${icons.save}<b>Save</b></button>
        </div>
      ` : retry ? `
        <div class="result-placeholder">
          <span>!</span>
          <p>Result download failed</p>
          <small>${escapeHtml(retry.message || '')}</small>
          <button id="retry-download" class="secondary-btn" type="button">Retry download</button>
        </div>
      ` : `<div class="result-placeholder"><span>${icons.spark}</span><p>Ready</p></div>`}
    </section>

    <section class="card">
      <div class="section-title"><span>Workflow</span><small>${hires ? 'Txt2Img + Hi-Res' : 'Txt2Img'}</small></div>
      ${workflowSelectHtml('workflow')}
    </section>

    <section class="card">
      <div class="section-title"><span>Base Model</span><small>${escapeHtml(workflow?.model_kind || 'workflow')}</small></div>
      ${checkpointSelectHtml('checkpoint')}
    </section>

    <section class="card">
      <div class="section-title"><span>Aspect Ratio</span><small>${state.settings.width} × ${state.settings.height}</small></div>
      <div class="size-row">
        ${presets.map((item) => `<button class="size-pill ${item.width === state.settings.width && item.height === state.settings.height ? 'selected' : ''}" data-width="${item.width}" data-height="${item.height}" type="button"><i style="--ratio:${item.width}/${item.height}"></i><span>${escapeHtml(item.label)}</span></button>`).join('')}
      </div>
      <div class="param-block">
        <div class="slider-row"><label for="steps">${hires ? 'First Steps' : 'Steps'}</label><input id="steps" type="range" min="10" max="80" value="${state.settings.steps}" /><output id="steps-value">${state.settings.steps}</output></div>
        <div class="slider-row"><label for="cfg">${hires ? 'First CFG' : 'CFG'}</label><input id="cfg" type="range" min="0" max="20" step="0.5" value="${state.settings.cfg}" /><output id="cfg-value">${Number(state.settings.cfg).toFixed(1)}</output></div>
        <div class="dual-select-row">
          <label>${hires ? 'First Sampler' : 'Sampler'}<select id="sampler-name">${selectOptionsHtml(samplerOptions(), state.settings.samplerName)}</select></label>
          <label>${hires ? 'First Scheduler' : 'Scheduler'}<select id="scheduler">${selectOptionsHtml(schedulerOptions(), state.settings.scheduler)}</select></label>
        </div>
        ${hires ? `
          <div class="slider-row"><label for="hires-steps">Hi-Res Steps</label><input id="hires-steps" type="range" min="5" max="60" value="${state.settings.hiresSteps}" /><output id="hires-steps-value">${state.settings.hiresSteps}</output></div>
          <div class="slider-row"><label for="hires-cfg">Hi-Res CFG</label><input id="hires-cfg" type="range" min="0" max="20" step="0.5" value="${state.settings.hiresCfg}" /><output id="hires-cfg-value">${Number(state.settings.hiresCfg).toFixed(1)}</output></div>
          <div class="slider-row"><label for="hires-denoise">Denoise</label><input id="hires-denoise" type="range" min="0" max="1" step="0.05" value="${state.settings.hiresDenoise}" /><output id="hires-denoise-value">${Number(state.settings.hiresDenoise).toFixed(2)}</output></div>
          <div class="dual-select-row">
            <label>Hi-Res Sampler<select id="hires-sampler-name">${selectOptionsHtml(samplerOptions(), state.settings.hiresSamplerName)}</select></label>
            <label>Hi-Res Scheduler<select id="hires-scheduler">${selectOptionsHtml(schedulerOptions(), state.settings.hiresScheduler)}</select></label>
          </div>
        ` : ''}
        <label class="seed-label">Seed<input id="seed" type="number" value="${state.settings.seed}" min="-1" placeholder="-1 = random" /></label>
      </div>
      <div class="row-actions">
        <button id="open-lora" class="secondary-btn" type="button">LoRA Stack · ${state.selectedLoras?.length || 0}</button>
        <button id="open-danbooru" class="secondary-btn" type="button">Reference Search</button>
      </div>
    </section>

    <section class="card">
      <div class="section-title"><span>Final Prompt</span><button id="edit-modules" class="link-button" type="button">Edit</button></div>
      <textarea id="prompt-preview" rows="8" readonly>${escapeHtml(finalPrompt())}</textarea>
      <div class="subsection-label">Negative Prompt</div>
      <textarea id="negative" rows="3" maxlength="3000" placeholder="lowres, bad anatomy, watermark...">${escapeHtml(state.settings.negative)}</textarea>
    </section>

    <div class="generate-wrapper">
      <button id="generate" class="generate-btn ${state.generating ? 'working' : ''}" ${state.generating ? 'disabled' : ''}>
        <span>${icons.spark}</span><b>${state.generating ? 'Generating…' : (state.gallery.length ? 'Generate Again' : 'Generate')}</b>
      </button>
    </div>
  `;

  attachWorkflowHandlers();
  attachCheckpointHandlers();
  document.querySelector('#edit-modules').addEventListener('click', () => switchTab('prompt'));
  document.querySelector('#open-lora').addEventListener('click', () => switchTab('lora'));
  document.querySelector('#open-danbooru').addEventListener('click', () => switchTab('danbooru'));
  document.querySelectorAll('.size-pill').forEach((button) => button.addEventListener('click', () => {
    state.settings.width = Number(button.dataset.width);
    state.settings.height = Number(button.dataset.height);
    renderActiveTab();
  }));
  document.querySelector('#negative').addEventListener('input', (event) => {
    state.settings.negative = event.target.value;
    saveNegativePrompt();
  });
  document.querySelector('#steps').addEventListener('input', (event) => {
    state.settings.steps = Number(event.target.value);
    document.querySelector('#steps-value').textContent = event.target.value;
  });
  document.querySelector('#cfg').addEventListener('input', (event) => {
    state.settings.cfg = Number(event.target.value);
    document.querySelector('#cfg-value').textContent = Number(event.target.value).toFixed(1);
  });
  document.querySelector('#sampler-name').addEventListener('change', (event) => {
    state.settings.samplerName = event.target.value;
  });
  document.querySelector('#scheduler').addEventListener('change', (event) => {
    state.settings.scheduler = event.target.value;
  });
  document.querySelector('#hires-steps')?.addEventListener('input', (event) => {
    state.settings.hiresSteps = Number(event.target.value);
    document.querySelector('#hires-steps-value').textContent = event.target.value;
  });
  document.querySelector('#hires-cfg')?.addEventListener('input', (event) => {
    state.settings.hiresCfg = Number(event.target.value);
    document.querySelector('#hires-cfg-value').textContent = Number(event.target.value).toFixed(1);
  });
  document.querySelector('#hires-denoise')?.addEventListener('input', (event) => {
    state.settings.hiresDenoise = Number(event.target.value);
    document.querySelector('#hires-denoise-value').textContent = Number(event.target.value).toFixed(2);
  });
  document.querySelector('#hires-sampler-name')?.addEventListener('change', (event) => {
    state.settings.hiresSamplerName = event.target.value;
  });
  document.querySelector('#hires-scheduler')?.addEventListener('change', (event) => {
    state.settings.hiresScheduler = event.target.value;
  });
  document.querySelector('#seed').addEventListener('input', (event) => {
    state.settings.seed = Number(event.target.value || -1);
  });
  document.querySelector('#generate').addEventListener('click', startGeneration);
  attachImageLoadHandlers();
  document.querySelector('#save-active')?.addEventListener('click', () => saveGalleryEntry(active));
  document.querySelector('#retry-download')?.addEventListener('click', retryDownloadResult);
}

async function startGeneration() {
  if (!hasPromptContent()) return showToast('Add at least one prompt module first.');
  state.generating = true;
  state.generationStartedAt = performance.now();
  state.currentJobId = '';
  state.progress = { value: 0, label: 'Submitting workflow…' };
  state.resultRetry = null;
  renderActiveTab();
  try {
    const hiresPayload = isHiresWorkflow() ? {
      hires_steps: Number(state.settings.hiresSteps),
      hires_cfg: Number(state.settings.hiresCfg),
      hires_denoise: Number(state.settings.hiresDenoise),
      hires_sampler_name: state.settings.hiresSamplerName,
      hires_scheduler: state.settings.hiresScheduler,
    } : {};
    const created = await generate({
      workflow_id: selectedWorkflowId(),
      prompt: finalPrompt(),
      negative_prompt: state.settings.negative.trim(),
      checkpoint: state.selectedCheckpoint || undefined,
      ...selectedSize(),
      steps: Number(state.settings.steps),
      cfg: Number(state.settings.cfg),
      sampler_name: state.settings.samplerName,
      scheduler: state.settings.scheduler,
      ...hiresPayload,
      seed: Number(state.settings.seed || -1),
      loras: state.selectedLoras || [],
    });
    state.currentJobId = created.job_id;
    await pollJob(created.job_id);
  } catch (error) {
    state.generating = false;
    showToast(error.message, 'error');
    renderGenerateIfVisible();
  }
}

async function pollJob(jobId) {
  while (true) {
    const job = await getJob(jobId);
    state.progress = { value: Number(job.progress || 0), label: job.stage || job.status || 'Generating…' };
    updateProgressIfVisible();
    if (job.status === 'complete') {
      state.progress = { value: 100, label: 'Opening display preview…' };
      renderGenerateIfVisible();
      const timing = {
        generationSeconds: Number(job.generation_seconds || 0),
        prepareSeconds: Number(job.gateway_prepare_seconds || 0),
        startedAt: state.generationStartedAt,
      };
      try {
        const count = await openJobImages(jobId, job, timing);
        state.generating = false;
        state.resultRetry = null;
        state.progress = { value: 100, label: 'Done' };
        showToast(`Preview ready · original stays on the PC until Save`);
        renderGenerateIfVisible();
      } catch (error) {
        state.generating = false;
        state.resultRetry = { jobId, message: error.message, timing };
        showToast('Generation is done, but the preview link failed. You can retry.', 'error');
        renderGenerateIfVisible();
      }
      return;
    }
    if (job.status === 'error') throw new Error(job.error || 'Generation failed');
    await delay(400);
  }
}

async function openJobImages(jobId, job, timing = {}) {
  const images = job.images?.length ? job.images : null;
  if (!images || !job.image_token) return downloadJobImagesWithRetry(jobId, timing);
  let added = 0;
  for (const item of images) {
    const index = Number(item.index || 0);
    if (state.gallery.some((entry) => entry.jobId === jobId && entry.index === index)) continue;
    addGalleryImage({
      jobId,
      index,
      displayUrl: jobImageUrl(jobId, index, 'display', job.image_token),
      accessToken: job.image_token,
      timing: {
        generationSeconds: timing.generationSeconds,
        prepareSeconds: timing.prepareSeconds,
        startedAt: timing.startedAt,
      },
      meta: {
        previewOnly: true,
        displaySizeBytes: item.display_size_bytes,
        originalSizeBytes: item.size_bytes,
        originalExtension: String(item.filename || '').split('.').pop()?.toLowerCase() || 'png',
      },
    });
    added += 1;
  }
  return added || images.length;
}

async function downloadJobImages(jobId, timing = {}) {
  const listed = await listJobImages(jobId);
  const images = listed.items?.length ? listed.items : [{ index: 0 }];
  let added = 0;
  for (const item of images) {
    const index = item.index || 0;
    if (state.gallery.some((entry) => entry.jobId === jobId && entry.index === index)) continue;
    const blob = await getImage(jobId, index);
    const originalExtension = String(item.filename || '').split('.').pop()?.toLowerCase() || 'png';
    addGalleryImage({
      jobId,
      index,
      blob,
      timing: {
        generationSeconds: timing.generationSeconds,
        prepareSeconds: timing.prepareSeconds,
        startedAt: timing.startedAt,
      },
      meta: {
        previewOnly: true,
        displaySizeBytes: item.display_size_bytes,
        originalSizeBytes: item.size_bytes,
        originalExtension,
      },
    });
    added += 1;
  }
  return added || images.length;
}

async function downloadJobImagesWithRetry(jobId, timing = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await downloadJobImages(jobId, timing);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delay(700 * attempt);
    }
  }
  throw lastError || new Error('Result image download failed');
}

async function retryDownloadResult() {
  if (!state.resultRetry?.jobId) return;
  const { jobId, timing } = state.resultRetry;
  state.generating = true;
  state.progress = { value: 100, label: 'Retrying result download…' };
  renderActiveTab();
  try {
    const count = await downloadJobImagesWithRetry(jobId, timing || {});
    state.generating = false;
    state.resultRetry = null;
    state.progress = { value: 100, label: 'Done' };
    showToast(`Downloaded ${count} image${count > 1 ? 's' : ''}`);
  } catch (error) {
    state.generating = false;
    state.resultRetry = { jobId, message: error.message, timing };
    showToast(error.message, 'error');
  }
  renderActiveTab();
}

function renderGallery(view) {
  const active = state.gallery.find((item) => item.id === state.activeGalleryId) || state.gallery[0];
  view.innerHTML = `
    ${active ? `
      <section class="result gallery-result">
        <img src="${imageSrc(active)}" data-gallery-load="${active.id}" alt="Gallery preview">
        <div class="result-actions">
          <div>
            <span>Selected Image</span>
            ${timingHtml(active)}
          </div>
          <button id="save-gallery" class="secondary-btn" type="button">Save</button>
        </div>
      </section>
      <div class="row-actions gallery-actions">
        <button id="delete-gallery" class="danger-btn" type="button">Delete Image</button>
      </div>
    ` : '<section class="card"><div class="empty-state">No generated images in this session.</div></section>'}
    <div class="section-title floating-title"><span>Session Gallery</span><small>${state.gallery.length} items</small></div>
    <div class="gallery-grid">
      ${state.gallery.map((item) => `<button class="${active?.id === item.id ? 'selected' : ''}" data-gallery="${item.id}" type="button"><img src="${imageSrc(item)}" data-gallery-load="${item.id}" alt="Generated thumbnail"></button>`).join('')}
    </div>`;
  document.querySelectorAll('[data-gallery]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeGalleryId = button.dataset.gallery;
      renderActiveTab();
    });
  });
  attachImageLoadHandlers();
  document.querySelector('#save-gallery')?.addEventListener('click', () => saveGalleryEntry(active));
  document.querySelector('#delete-gallery')?.addEventListener('click', () => removeGalleryImage(active.id));
}

async function ensureLorasLoaded() {
  if (state.lorasLoaded) return;
  try {
    const body = await listLoras();
    state.loras = body.items || [];
    state.lorasLoaded = true;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderLora(view) {
  if (!state.checkpointsLoaded || state.checkpointsWorkflowId !== selectedWorkflowId()) {
    ensureCheckpointsLoaded().then(() => {
      if (state.activeTab === 'lora') renderActiveTab();
    });
  }
  if (!state.lorasLoaded) {
    ensureLorasLoaded().then(() => {
      if (state.activeTab === 'lora') renderActiveTab();
    });
  }
  const selectedNames = new Set((state.selectedLoras || []).map((item) => item.name));
  const query = state.loraSearch.trim().toLowerCase();
  const filtered = state.loras
    .filter((item) => !query || item.name.toLowerCase().includes(query))
    .slice(0, 90);
  view.innerHTML = `
    <section class="card">
      <div class="section-title"><span>Workflow</span><small>${escapeHtml(currentWorkflowLabel())}</small></div>
      ${workflowSelectHtml('model-workflow')}
    </section>

    <section class="card">
      <div class="section-title"><span>Base Model</span><small>${state.checkpoints.length} found · ${escapeHtml(currentWorkflow()?.model_kind || 'workflow')}</small></div>
      ${checkpointSelectHtml('model-checkpoint')}
    </section>

    <section class="card">
      <div class="section-title"><span>Active LoRA Stack</span><small>${state.selectedLoras?.length || 0} loaded</small></div>
      <div class="lora-stack">
        ${(state.selectedLoras || []).map((item, index) => `
          <div class="lora-chip">
            <b>${escapeHtml(item.name)}</b>
            <div class="lora-controls">
              <label>Weight <input data-lora-weight="${index}" type="number" min="0" max="2" step="0.05" value="${Number(item.weight).toFixed(2)}"></label>
              <button data-remove-lora="${index}" class="remove-btn" type="button">Remove</button>
            </div>
          </div>
        `).join('') || '<div class="empty-state small">No LoRA selected.</div>'}
      </div>
    </section>

    <section class="card">
      <div class="section-title"><span>Local LoRA Library</span><small>${state.lorasLoaded ? state.loras.length : '…'}</small></div>
      <div class="row-actions">
        <input id="lora-search" type="search" value="${escapeHtml(state.loraSearch)}" placeholder="Search local LoRA files">
        <button id="clear-loras" class="secondary-btn" type="button">Clear</button>
      </div>
      <div class="lora-list">
        ${state.lorasLoaded ? filtered.map((item) => `
          <button class="${selectedNames.has(item.name) ? 'selected' : ''}" data-add-lora="${escapeHtml(item.name)}" type="button">
            <span>${escapeHtml(item.name)}</span><small>${item.size_mb || '?'} MB</small>
          </button>
        `).join('') : '<div class="loading-line">Reading LoRA files…</div>'}
      </div>
    </section>`;
  attachWorkflowHandlers();
  attachCheckpointHandlers();
  document.querySelector('#lora-search').addEventListener('input', (event) => {
    state.loraSearch = event.target.value;
    renderActiveTab();
  });
  document.querySelector('#clear-loras').addEventListener('click', () => {
    state.selectedLoras = [];
    saveSelectedLoras();
    renderActiveTab();
  });
  document.querySelectorAll('[data-add-lora]').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.dataset.addLora;
      if (!(state.selectedLoras || []).some((item) => item.name === name)) {
        state.selectedLoras.push({ name, weight: 1, text_encoder_weight: 1 });
      }
      saveSelectedLoras();
      renderActiveTab();
    });
  });
  document.querySelectorAll('[data-remove-lora]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedLoras.splice(Number(button.dataset.removeLora), 1);
      saveSelectedLoras();
      renderActiveTab();
    });
  });
  document.querySelectorAll('[data-lora-weight]').forEach((input) => {
    input.addEventListener('input', () => {
      const index = Number(input.dataset.loraWeight);
      const value = Math.max(0, Math.min(2, Number(input.value || 0)));
      state.selectedLoras[index].weight = value;
      state.selectedLoras[index].text_encoder_weight = value;
      saveSelectedLoras();
    });
  });
}

function renderPromptModules(view) {
  view.innerHTML = `
    <section class="prompt-toolbar card compact-card">
      <div>
        <div class="section-title"><span>Prompt Modules</span></div>
        <p class="muted compact-copy">Stack presets, organize them into multiple groups, or import several at once.</p>
      </div>
      <button id="add-prompt-module" class="secondary-btn" type="button">+ 添加模块</button>
    </section>
    <div class="module-list">
      ${state.moduleDefinitions.map((module) => renderModuleEditor(module)).join('')}
    </div>
    <section class="card">
      <div class="section-title"><span>Final Prompt Preview</span><button id="copy-final" class="link-button" type="button">Copy</button></div>
      <textarea id="final-prompt" rows="10" readonly>${escapeHtml(finalPrompt())}</textarea>
    </section>`;
  state.moduleDefinitions.forEach((module) => attachModuleHandlers(module));
  document.querySelector('#add-prompt-module').addEventListener('click', addPromptModule);
  document.querySelector('#copy-final').addEventListener('click', () => copyText(finalPrompt()));
}

function renderModuleEditor(module) {
  const data = state.modules[module.id] || emptyModuleData();
  const selectedIds = Array.isArray(data.selectedIds) ? data.selectedIds : (data.selectedId ? [data.selectedId] : []);
  const visibleItems = data.activeGroupId
    ? data.items.filter((item) => item.groupIds?.includes(data.activeGroupId))
    : data.items;
  const activeGroup = data.groups.find((group) => group.id === data.activeGroupId);
  return `
    <article class="module-card" data-module="${module.id}">
      <div class="module-head">
        <div>
          <h3>${escapeHtml(module.label)}</h3>
          <small>${selectedIds.length} stacked · ${data.items.length} saved</small>
        </div>
        ${module.builtin ? '' : `
          <div class="module-admin-actions">
            <button data-rename-prompt-module="${module.id}" class="icon-text-btn" type="button">Rename</button>
            <button data-remove-prompt-module="${module.id}" class="icon-text-btn danger-text" type="button">Delete</button>
          </div>`}
      </div>
      <div class="module-groups" aria-label="Preset groups">
        <button class="group-chip ${data.activeGroupId ? '' : 'selected'}" data-filter-module-group="${module.id}" data-group-id="" type="button">All</button>
        ${data.groups.map((group) => `
          <button class="group-chip ${data.activeGroupId === group.id ? 'selected' : ''}" data-filter-module-group="${module.id}" data-group-id="${escapeHtml(group.id)}" type="button">${escapeHtml(group.name)}</button>
        `).join('')}
        <button class="group-chip add" data-add-module-group="${module.id}" type="button">+ Group</button>
      </div>
      ${activeGroup ? `
        <div class="active-group-actions">
          <span>Viewing ${escapeHtml(activeGroup.name)}</span>
          <button data-rename-module-group="${module.id}" class="link-button" type="button">Rename</button>
          <button data-delete-module-group="${module.id}" class="link-button danger-text" type="button">Delete group</button>
        </div>` : ''}
      <div class="prompt-stack">
        ${visibleItems.map((item) => {
          const itemGroups = data.groups.filter((group) => item.groupIds?.includes(group.id));
          return `
            <div class="module-preset-row">
              <button class="module-preset ${selectedIds.includes(item.id) ? 'selected' : ''}" data-toggle-module-preset="${module.id}" data-preset-id="${escapeHtml(item.id)}" type="button">
                <span>${escapeHtml(item.name)}</span>
                ${itemGroups.length ? `<small>${itemGroups.map((group) => escapeHtml(group.name)).join(' · ')}</small>` : ''}
              </button>
              <button class="preset-edit-btn" data-edit-module-preset="${module.id}" data-preset-id="${escapeHtml(item.id)}" type="button">Edit</button>
            </div>`;
        }).join('') || '<div class="empty-state small">No presets in this group.</div>'}
      </div>
      <input data-module-name="${module.id}" type="text" value="" placeholder="Preset name">
      <textarea data-module-draft="${module.id}" rows="4" placeholder="Manual ${escapeHtml(module.label)}">${escapeHtml(data.draft)}</textarea>
      <div class="preset-group-assignment">
        <span class="field-caption">Belongs to groups (multiple allowed)</span>
        <div class="group-checks">
          ${data.groups.map((group) => `
            <label class="group-check">
              <input data-preset-group="${module.id}" type="checkbox" value="${escapeHtml(group.id)}" ${data.activeGroupId === group.id ? 'checked' : ''}>
              <span>${escapeHtml(group.name)}</span>
            </label>`).join('') || '<span class="muted compact-copy">Create a group to classify presets.</span>'}
        </div>
      </div>
      <div class="row-actions wrap">
        <button data-save-module="${module.id}" class="secondary-btn" type="button">Save / Update Preset</button>
        <button data-batch-import="${module.id}" class="secondary-btn" type="button">Batch Import</button>
        <button data-clear-module="${module.id}" class="secondary-btn" type="button">Clear</button>
        <button data-delete-module="${module.id}" class="danger-btn ghost" type="button" ${selectedIds.length ? '' : 'disabled'}>Delete Selected</button>
      </div>
    </article>`;
}

function attachModuleHandlers(module) {
  const card = document.querySelector(`[data-module="${module.id}"]`);
  const nameInput = document.querySelector(`[data-module-name="${module.id}"]`);
  const draftInput = document.querySelector(`[data-module-draft="${module.id}"]`);
  document.querySelectorAll(`[data-filter-module-group="${module.id}"]`).forEach((button) => {
    button.addEventListener('click', () => {
      state.modules[module.id].activeGroupId = button.dataset.groupId || '';
      saveModules();
      renderActiveTab();
    });
  });
  document.querySelectorAll(`[data-toggle-module-preset="${module.id}"]`).forEach((button) => {
    button.addEventListener('click', () => {
      const data = state.modules[module.id];
      const id = button.dataset.presetId;
      data.selectedIds = Array.isArray(data.selectedIds) ? data.selectedIds : [];
      const index = data.selectedIds.indexOf(id);
      if (index >= 0) data.selectedIds.splice(index, 1);
      else data.selectedIds.push(id);
      data.selectedId = data.selectedIds[0] || '';
      saveModules();
      renderActiveTab();
    });
  });
  document.querySelectorAll(`[data-edit-module-preset="${module.id}"]`).forEach((button) => {
    button.addEventListener('click', () => {
      const item = state.modules[module.id].items.find((entry) => entry.id === button.dataset.presetId);
      if (!item) return;
      card.dataset.editingId = item.id;
      nameInput.value = item.name;
      draftInput.value = item.content;
      document.querySelectorAll(`[data-preset-group="${module.id}"]`).forEach((input) => {
        input.checked = item.groupIds?.includes(input.value) || false;
      });
      const saveButton = document.querySelector(`[data-save-module="${module.id}"]`);
      saveButton.textContent = 'Update Preset';
      nameInput.focus();
    });
  });
  draftInput.addEventListener('input', () => {
    state.modules[module.id].draft = draftInput.value;
    saveModules();
    const finalPromptBox = document.querySelector('#final-prompt');
    if (finalPromptBox) finalPromptBox.value = finalPrompt();
  });
  document.querySelector(`[data-save-module="${module.id}"]`).addEventListener('click', () => {
    const data = state.modules[module.id];
    const name = nameInput.value.trim();
    if (!name) return showToast('Name this preset first.', 'error');
    const content = draftInput.value;
    const groupIds = [...document.querySelectorAll(`[data-preset-group="${module.id}"]:checked`)].map((input) => input.value);
    let item = data.items.find((entry) => entry.id === card.dataset.editingId)
      || data.items.find((entry) => entry.name.trim().toLowerCase() === name.toLowerCase());
    if (!item) {
      item = { id: uid('module'), name, content, groupIds };
      data.items.push(item);
    } else {
      item.name = name;
      item.content = content;
      item.groupIds = groupIds;
    }
    data.selectedIds = Array.isArray(data.selectedIds) ? data.selectedIds : [];
    if (!data.selectedIds.includes(item.id)) data.selectedIds.push(item.id);
    data.selectedId = data.selectedIds[0] || '';
    data.draft = '';
    delete card.dataset.editingId;
    saveModules();
    showToast('Preset saved');
    renderActiveTab();
  });
  document.querySelector(`[data-batch-import="${module.id}"]`).addEventListener('click', () => openBatchImport(module));
  document.querySelector(`[data-add-module-group="${module.id}"]`).addEventListener('click', () => addModuleGroup(module));
  document.querySelector(`[data-rename-module-group="${module.id}"]`)?.addEventListener('click', () => renameActiveModuleGroup(module));
  document.querySelector(`[data-delete-module-group="${module.id}"]`)?.addEventListener('click', () => deleteActiveModuleGroup(module));
  document.querySelector(`[data-rename-prompt-module="${module.id}"]`)?.addEventListener('click', () => renamePromptModule(module));
  document.querySelector(`[data-remove-prompt-module="${module.id}"]`)?.addEventListener('click', () => removePromptModule(module));
  document.querySelector(`[data-clear-module="${module.id}"]`).addEventListener('click', () => {
    state.modules[module.id].selectedIds = [];
    state.modules[module.id].selectedId = '';
    state.modules[module.id].draft = '';
    saveModules();
    renderActiveTab();
  });
  document.querySelector(`[data-delete-module="${module.id}"]`).addEventListener('click', () => {
    const data = state.modules[module.id];
    const selected = new Set(Array.isArray(data.selectedIds) ? data.selectedIds : []);
    data.items = data.items.filter((item) => !selected.has(item.id));
    data.selectedIds = [];
    data.selectedId = '';
    saveModules();
    renderActiveTab();
  });
}

function addPromptModule() {
  const label = window.prompt('New module name')?.trim();
  if (!label) return;
  if (state.moduleDefinitions.some((module) => module.label.toLowerCase() === label.toLowerCase())) {
    return showToast('A module with this name already exists.', 'error');
  }
  const id = uid('custom-module');
  state.moduleDefinitions.push({ id, label, builtin: false });
  state.modules[id] = emptyModuleData();
  saveModules();
  renderActiveTab();
}

function renamePromptModule(module) {
  const label = window.prompt('Rename module', module.label)?.trim();
  if (!label || label === module.label) return;
  if (state.moduleDefinitions.some((entry) => entry.id !== module.id && entry.label.toLowerCase() === label.toLowerCase())) {
    return showToast('A module with this name already exists.', 'error');
  }
  module.label = label;
  saveModules();
  renderActiveTab();
}

function removePromptModule(module) {
  if (module.builtin || !window.confirm(`Delete module “${module.label}” and all presets inside it?`)) return;
  state.moduleDefinitions = state.moduleDefinitions.filter((entry) => entry.id !== module.id);
  delete state.modules[module.id];
  saveModules();
  renderActiveTab();
}

function addModuleGroup(module) {
  const name = window.prompt(`New group in ${module.label}`)?.trim();
  if (!name) return;
  const data = state.modules[module.id];
  if (data.groups.some((group) => group.name.toLowerCase() === name.toLowerCase())) {
    return showToast('This group already exists.', 'error');
  }
  const group = { id: uid('group'), name };
  data.groups.push(group);
  data.activeGroupId = group.id;
  saveModules();
  renderActiveTab();
}

function renameActiveModuleGroup(module) {
  const data = state.modules[module.id];
  const group = data.groups.find((entry) => entry.id === data.activeGroupId);
  if (!group) return;
  const name = window.prompt('Rename group', group.name)?.trim();
  if (!name || name === group.name) return;
  if (data.groups.some((entry) => entry.id !== group.id && entry.name.toLowerCase() === name.toLowerCase())) {
    return showToast('This group already exists.', 'error');
  }
  group.name = name;
  saveModules();
  renderActiveTab();
}

function deleteActiveModuleGroup(module) {
  const data = state.modules[module.id];
  const group = data.groups.find((entry) => entry.id === data.activeGroupId);
  if (!group || !window.confirm(`Delete group “${group.name}”? Presets will remain ungrouped.`)) return;
  data.groups = data.groups.filter((entry) => entry.id !== group.id);
  data.items.forEach((item) => { item.groupIds = (item.groupIds || []).filter((id) => id !== group.id); });
  data.activeGroupId = '';
  saveModules();
  renderActiveTab();
}

function openBatchImport(module) {
  document.querySelector('.batch-import-backdrop')?.remove();
  const data = state.modules[module.id];
  document.body.insertAdjacentHTML('beforeend', `
    <div class="batch-import-backdrop" role="presentation">
      <section class="batch-import-dialog" role="dialog" aria-modal="true" aria-labelledby="batch-import-title">
        <div class="module-head">
          <div><small>Batch Import</small><h3 id="batch-import-title">${escapeHtml(module.label)}</h3></div>
          <button id="close-batch-import" class="preset-edit-btn" type="button">Close</button>
        </div>
        <p class="muted compact-copy">One preset per line. Put a Tab between its name and prompt.</p>
        <textarea id="batch-import-text" rows="9" placeholder="Preset name&#9;prompt tags"></textarea>
        <div class="field-caption">Add every imported preset to:</div>
        <div class="group-checks import-group-checks">
          ${data.groups.map((group) => `
            <label class="group-check">
              <input data-import-group type="checkbox" value="${escapeHtml(group.id)}" ${data.activeGroupId === group.id ? 'checked' : ''}>
              <span>${escapeHtml(group.name)}</span>
            </label>`).join('') || '<span class="muted compact-copy">No groups yet. Presets will be ungrouped.</span>'}
        </div>
        <label class="import-conflict-row">
          <span>Duplicate names</span>
          <select id="batch-import-conflict">
            <option value="rename" selected>Keep both (auto rename)</option>
            <option value="skip">Skip imported duplicate</option>
            <option value="overwrite">Overwrite existing preset</option>
          </select>
        </label>
        <div id="batch-import-preview" class="import-preview muted">Paste presets to preview.</div>
        <div class="row-actions">
          <button id="cancel-batch-import" class="secondary-btn" type="button">Cancel</button>
          <button id="confirm-batch-import" class="primary" type="button">Import</button>
        </div>
      </section>
    </div>`);
  const backdrop = document.querySelector('.batch-import-backdrop');
  const input = document.querySelector('#batch-import-text');
  const preview = document.querySelector('#batch-import-preview');
  const close = () => backdrop.remove();
  const updatePreview = () => {
    const parsed = parseBatchImport(input.value);
    if (parsed.errors.length) {
      preview.classList.add('error-text');
      preview.textContent = parsed.errors.slice(0, 3).join(' ');
    } else {
      preview.classList.remove('error-text');
      const names = parsed.entries.slice(0, 4).map((entry) => entry.name).join(', ');
      preview.textContent = parsed.entries.length ? `${parsed.entries.length} presets ready: ${names}${parsed.entries.length > 4 ? '…' : ''}` : 'Paste presets to preview.';
    }
  };
  input.addEventListener('input', updatePreview);
  document.querySelector('#close-batch-import').addEventListener('click', close);
  document.querySelector('#cancel-batch-import').addEventListener('click', close);
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
  document.querySelector('#confirm-batch-import').addEventListener('click', () => {
    const parsed = parseBatchImport(input.value);
    if (parsed.errors.length || !parsed.entries.length) {
      updatePreview();
      return showToast(parsed.errors[0] || 'Nothing to import.', 'error');
    }
    const groupIds = [...document.querySelectorAll('[data-import-group]:checked')].map((checkbox) => checkbox.value);
    const conflict = document.querySelector('#batch-import-conflict').value;
    const imported = importBatchItems(data, parsed.entries, groupIds, conflict, () => uid('module'));
    state.modules[module.id] = imported.data;
    saveModules();
    close();
    const summary = imported.result;
    showToast(`Imported ${summary.added + summary.overwritten}; skipped ${summary.skipped}`);
    renderActiveTab();
  });
  input.focus();
}

function revokeDanbooruObjects() {
  danbooruThumbRun += 1;
  for (const post of state.danbooru.posts) {
    if (post.thumbObjectUrl) URL.revokeObjectURL(post.thumbObjectUrl);
    post.thumbObjectUrl = '';
  }
  if (state.danbooru.selectedObjectUrl) URL.revokeObjectURL(state.danbooru.selectedObjectUrl);
  state.danbooru.selectedObjectUrl = '';
  state.danbooru.selectedBlob = null;
}

function renderDanbooruThumb(post) {
  if (post.thumbObjectUrl) return `<img src="${post.thumbObjectUrl}" alt="Danbooru post ${post.id}">`;
  if (post.thumbError) return '<span class="thumb-loading error">Failed</span>';
  return '<span class="thumb-loading">Loading</span>';
}

function renderDanbooru(view) {
  const hasPrevious = state.danbooru.page > 1 && !state.danbooru.loading;
  const hasNext = Boolean(state.danbooru.hasMore) && !state.danbooru.loading;
  view.innerHTML = `
    <section class="card danbooru-search-card">
      <div class="section-title"><span>Danbooru</span><small>Page ${state.danbooru.page}</small></div>
      <form id="danbooru-form" class="search-row">
        <div class="autocomplete-box">
          <input id="danbooru-query" type="search" value="${escapeHtml(state.danbooru.query)}" placeholder="amiya_(arknights) solo" autocomplete="off" spellcheck="false">
          <div id="danbooru-suggestions">${renderDanbooruSuggestionsHtml()}</div>
        </div>
        <button class="primary slim" type="submit" ${state.danbooru.loading ? 'disabled' : ''}>${state.danbooru.loading ? 'Searching…' : 'Search'}</button>
      </form>
      ${state.danbooru.error ? `<p class="error-text">${escapeHtml(state.danbooru.error)}</p>` : ''}
      <div class="pager">
        <button id="danbooru-prev" class="secondary-btn" type="button" ${hasPrevious ? '' : 'disabled'}>Previous</button>
        <span>Page ${state.danbooru.page}</span>
        <button id="danbooru-next" class="secondary-btn" type="button" ${hasNext ? '' : 'disabled'}>Next</button>
      </div>
    </section>

    <div class="danbooru-grid">
      ${state.danbooru.loading ? '<div class="loading-line span-grid">Searching…</div>' : state.danbooru.posts.map((post, index) => `
        <button class="${state.danbooru.selected?.id === post.id ? 'selected' : ''}" data-post="${index}" type="button">
          <span class="thumb-frame" data-thumb-index="${index}">${renderDanbooruThumb(post)}</span>
        </button>
      `).join('') || '<div class="empty-state span-grid">No posts yet.</div>'}
    </div>

    <section class="card">
      <div class="section-title">
        <span>WD14 Tags Output</span>
        <small>${state.danbooru.tagging ? 'Tagging…' : (state.danbooru.selected ? `Post ${state.danbooru.selected.id}` : 'No selection')}</small>
      </div>
      ${state.danbooru.selectedObjectUrl ? `<div class="reference-preview"><img src="${state.danbooru.selectedObjectUrl}" alt="Reference preview"></div>` : ''}
      ${state.danbooru.tagError ? `<p class="error-text">${escapeHtml(state.danbooru.tagError)}</p>` : ''}
      <textarea id="tag-output" rows="8" placeholder="Select an image to run local WD14 tagging.">${escapeHtml(state.danbooru.tagOutput)}</textarea>
      <div class="row-actions wrap">
        <button id="copy-tags" class="secondary-btn" type="button">Copy Tags</button>
        <button id="run-wd14" class="secondary-btn" type="button" ${state.danbooru.selectedBlob && !state.danbooru.tagging ? '' : 'disabled'}>${state.danbooru.tagging ? 'WD14 Tagging…' : 'Run WD14'}</button>
        <button id="normalize-tags" class="secondary-btn" type="button">Clean for SD</button>
        <button id="fill-reference" class="secondary-btn" type="button">Fill Reference Module</button>
        <button id="fill-natural" class="secondary-btn" type="button">Fill Natural Module</button>
        <button id="save-reference" class="secondary-btn" type="button" ${state.danbooru.savingOriginal ? 'disabled' : ''}>${state.danbooru.savingOriginal ? 'Saving…' : 'Save Original'}</button>
      </div>
    </section>`;
  document.querySelector('#danbooru-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    state.danbooru.query = document.querySelector('#danbooru-query').value.trim();
    state.danbooru.page = 1;
    state.danbooru.suggestions = [];
    await runDanbooruSearch(1);
  });
  document.querySelector('#danbooru-query').addEventListener('input', (event) => {
    state.danbooru.query = event.target.value;
    scheduleDanbooruAutocomplete(event.target.value);
  });
  document.querySelector('#danbooru-prev').addEventListener('click', () => runDanbooruSearch(Math.max(1, state.danbooru.page - 1)));
  document.querySelector('#danbooru-next').addEventListener('click', () => runDanbooruSearch(state.danbooru.page + 1));
  attachDanbooruSuggestionHandlers();
  document.querySelectorAll('[data-post]').forEach((button) => {
    button.addEventListener('click', () => selectDanbooruPost(Number(button.dataset.post)));
  });
  document.querySelector('#tag-output').addEventListener('input', (event) => {
    state.danbooru.tagOutput = event.target.value;
  });
  document.querySelector('#copy-tags').addEventListener('click', () => copyText(state.danbooru.tagOutput));
  document.querySelector('#run-wd14').addEventListener('click', () => runWd14ForSelected());
  document.querySelector('#normalize-tags').addEventListener('click', normalizeCurrentTags);
  document.querySelector('#fill-reference').addEventListener('click', () => fillModule('reference', state.danbooru.tagOutput));
  document.querySelector('#fill-natural').addEventListener('click', () => fillModule('natural', state.danbooru.tagOutput));
  document.querySelector('#save-reference').addEventListener('click', saveDanbooruReference);
}

function renderDanbooruSuggestionsHtml() {
  if (state.danbooru.suggestions.length) {
    return `
      <div class="autocomplete-list">
        ${state.danbooru.suggestions.map((item, index) => `
          <button data-suggest="${index}" class="tag-suggest cat-${item.category}" type="button">
            <span>
              <b>${escapeHtml(item.value)}</b>
              <small>${escapeHtml(item.label)}</small>
            </span>
            <em>${escapeHtml(TAG_CATEGORY_LABELS[item.category] || item.category_name || 'Tag')} · ${Number(item.post_count || 0).toLocaleString()}</em>
          </button>
        `).join('')}
      </div>`;
  }
  if (state.danbooru.suggestLoading) {
    return '<div class="autocomplete-list"><div class="suggest-loading">Completing…</div></div>';
  }
  return '';
}

function attachDanbooruSuggestionHandlers() {
  document.querySelectorAll('[data-suggest]').forEach((button) => {
    button.addEventListener('click', () => applyDanbooruSuggestion(Number(button.dataset.suggest)));
  });
}

function updateDanbooruSuggestions() {
  const panel = document.querySelector('#danbooru-suggestions');
  if (!panel) return;
  panel.innerHTML = renderDanbooruSuggestionsHtml();
  attachDanbooruSuggestionHandlers();
}

function scheduleDanbooruAutocomplete(value) {
  if (danbooruAutocompleteTimer) clearTimeout(danbooruAutocompleteTimer);
  const token = currentDanbooruToken(value).trim();
  state.danbooru.suggestQuery = token;
  if (token.length < 2) {
    state.danbooru.suggestions = [];
    state.danbooru.suggestLoading = false;
    updateDanbooruSuggestions();
    return;
  }
  state.danbooru.suggestLoading = true;
  updateDanbooruSuggestions();
  danbooruAutocompleteTimer = setTimeout(() => runDanbooruAutocomplete(token), 150);
}

async function runDanbooruAutocomplete(token) {
  const seq = ++danbooruAutocompleteSeq;
  try {
    const key = token.toLowerCase();
    const body = danbooruAutocompleteCache.get(key) || await autocompleteDanbooru(token, 10);
    danbooruAutocompleteCache.set(key, body);
    if (seq !== danbooruAutocompleteSeq || state.activeTab !== 'danbooru') return;
    if (state.danbooru.suggestQuery !== token) return;
    state.danbooru.suggestions = body.items || [];
    state.danbooru.suggestLoading = false;
    updateDanbooruSuggestions();
  } catch {
    if (seq !== danbooruAutocompleteSeq) return;
    state.danbooru.suggestions = [];
    state.danbooru.suggestLoading = false;
    updateDanbooruSuggestions();
  }
}

function applyDanbooruSuggestion(index) {
  const item = state.danbooru.suggestions[index];
  if (!item) return;
  state.danbooru.query = replaceLastDanbooruToken(state.danbooru.query, item.value);
  state.danbooru.suggestions = [];
  state.danbooru.suggestLoading = false;
  updateDanbooruSuggestions();
  const input = document.querySelector('#danbooru-query');
  if (input) {
    input.value = state.danbooru.query;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

async function runDanbooruSearch(page = state.danbooru.page) {
  const query = state.danbooru.query.trim();
  const nextPage = Math.max(1, Number(page || 1));
  const cacheKey = `${query.toLowerCase()}::${nextPage}`;
  revokeDanbooruObjects();
  const runId = ++danbooruThumbRun;
  state.danbooru.loading = true;
  state.danbooru.page = nextPage;
  state.danbooru.error = '';
  state.danbooru.posts = [];
  state.danbooru.hasMore = false;
  state.danbooru.selected = null;
  state.danbooru.tagOutput = '';
  state.danbooru.rawTagOutput = '';
  state.danbooru.tagging = false;
  state.danbooru.tagError = '';
  state.danbooru.suggestions = [];
  state.danbooru.suggestLoading = false;
  renderActiveTab();
  const cached = danbooruSearchCache.get(cacheKey);
  if (cached) {
    const cachedItems = Array.isArray(cached) ? cached : cached.items || [];
    state.danbooru.posts = cachedItems.map((post) => ({ ...post, thumbObjectUrl: '', thumbError: false }));
    state.danbooru.hasMore = Array.isArray(cached) ? cachedItems.length >= DANBOORU_LIMIT : Boolean(cached.hasMore);
    state.danbooru.loading = false;
    renderActiveTab();
    hydrateDanbooruThumbs(runId).catch(() => {});
    return;
  }
  try {
    const body = await searchDanbooru(query, nextPage, DANBOORU_LIMIT);
    if (runId !== danbooruThumbRun) return;
    const items = body.items || [];
    danbooruSearchCache.set(cacheKey, {
      items: items.map((post) => ({ ...post, thumbObjectUrl: '', thumbError: false })),
      hasMore: Boolean(body.has_more),
    });
    state.danbooru.posts = items.map((post) => ({ ...post, thumbObjectUrl: '', thumbError: false }));
    state.danbooru.hasMore = Boolean(body.has_more);
    state.danbooru.loading = false;
    renderActiveTab();
    hydrateDanbooruThumbs(runId).catch(() => {});
  } catch (error) {
    if (runId !== danbooruThumbRun) return;
    state.danbooru.loading = false;
    state.danbooru.error = error.message;
    renderActiveTab();
  }
}

function updateDanbooruThumb(index) {
  if (state.activeTab !== 'danbooru') return;
  const frame = document.querySelector(`[data-thumb-index="${index}"]`);
  const post = state.danbooru.posts[index];
  if (frame && post) frame.innerHTML = renderDanbooruThumb(post);
}

async function hydrateDanbooruThumbs(runId) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(THUMB_CONCURRENCY, state.danbooru.posts.length) }, async () => {
    while (runId === danbooruThumbRun && state.activeTab === 'danbooru') {
      const index = cursor;
      cursor += 1;
      if (index >= state.danbooru.posts.length) return;
      const post = state.danbooru.posts[index];
      if (!post?.preview_url || post.thumbObjectUrl) continue;
      try {
        let blob = danbooruThumbBlobCache.get(post.preview_url);
        if (!blob) {
          blob = await getDanbooruImage(post.preview_url);
          danbooruThumbBlobCache.set(post.preview_url, blob);
          while (danbooruThumbBlobCache.size > DANBOORU_THUMB_CACHE_MAX) {
            danbooruThumbBlobCache.delete(danbooruThumbBlobCache.keys().next().value);
          }
        }
        if (runId !== danbooruThumbRun || state.activeTab !== 'danbooru') return;
        post.thumbObjectUrl = URL.createObjectURL(blob);
        post.thumbError = false;
      } catch {
        post.thumbObjectUrl = '';
        post.thumbError = true;
      }
      updateDanbooruThumb(index);
    }
  });
  await Promise.allSettled(workers);
}

async function selectDanbooruPost(index) {
  const post = state.danbooru.posts[index];
  if (!post) return;
  const runId = ++danbooruSelectRun;
  state.danbooru.selected = post;
  state.danbooru.selectedBlob = null;
  state.danbooru.rawTagOutput = post.tags || '';
  state.danbooru.tagOutput = 'WD14 tagging…';
  state.danbooru.tagging = true;
  state.danbooru.tagError = '';
  if (state.danbooru.selectedObjectUrl) URL.revokeObjectURL(state.danbooru.selectedObjectUrl);
  state.danbooru.selectedObjectUrl = '';
  renderActiveTab();
  try {
    const previewUrl = post.sample_url || post.file_url || post.preview_url;
    const blob = await getDanbooruImage(previewUrl);
    if (runId !== danbooruSelectRun || state.danbooru.selected?.id !== post.id) return;
    state.danbooru.selectedBlob = blob;
    state.danbooru.selectedObjectUrl = URL.createObjectURL(blob);
    if (state.activeTab === 'danbooru') renderActiveTab();
    await runWd14ForSelected(runId);
  } catch (error) {
    state.danbooru.tagging = false;
    state.danbooru.tagOutput = state.danbooru.rawTagOutput;
    state.danbooru.tagError = error.message;
    if (state.activeTab === 'danbooru') renderActiveTab();
    showToast(error.message, 'error');
  }
}

async function runWd14ForSelected(expectedRunId = 0) {
  const post = state.danbooru.selected;
  const blob = state.danbooru.selectedBlob;
  if (!post || !blob) return showToast('Select a Danbooru image first.');
  const selectedId = post.id;
  state.danbooru.tagging = true;
  state.danbooru.tagError = '';
  if (!state.danbooru.tagOutput || state.danbooru.tagOutput === state.danbooru.rawTagOutput) {
    state.danbooru.tagOutput = 'WD14 tagging…';
  }
  if (state.activeTab === 'danbooru') renderActiveTab();
  try {
    const image = await blobToBase64(blob);
    const ext = imageExtension(blob);
    const body = await interrogateTags(image, `danbooru-${selectedId || Date.now()}.${ext}`);
    if ((expectedRunId && expectedRunId !== danbooruSelectRun) || state.danbooru.selected?.id !== selectedId) return;
    state.danbooru.tagOutput = body.text || body.raw_text || '';
    state.danbooru.tagging = false;
    state.danbooru.tagError = '';
    state.tagger = { ...(state.tagger || {}), available: true, message: `WD14 ready (${body.model || 'default'})` };
    if (state.activeTab === 'danbooru') renderActiveTab();
    showToast(`WD14 tagged ${body.count || 0} tags`);
  } catch (error) {
    if ((expectedRunId && expectedRunId !== danbooruSelectRun) || state.danbooru.selected?.id !== selectedId) return;
    state.danbooru.tagging = false;
    state.danbooru.tagError = `WD14 failed: ${error.message}`;
    state.danbooru.tagOutput = state.danbooru.rawTagOutput || '';
    if (state.activeTab === 'danbooru') renderActiveTab();
    showToast(error.message, 'error');
  }
}

async function saveDanbooruReference() {
  const post = state.danbooru.selected;
  if (!post) return showToast('Select a Danbooru image first.');
  state.danbooru.savingOriginal = true;
  renderActiveTab();
  const urls = [...new Set([post.original_url, post.file_url, post.sample_url, post.preview_url].filter(Boolean))];
  let lastError = null;
  for (const url of urls) {
    try {
      const blob = await getDanbooruImage(url);
      const ext = extensionFromUrl(url, imageExtension(blob));
      await saveBlobToGallery(blob, `danbooru-${post.id || Date.now()}.${ext}`);
      state.danbooru.savingOriginal = false;
      if (state.activeTab === 'danbooru') renderActiveTab();
      return;
    } catch (error) {
      lastError = error;
    }
  }
  if (state.danbooru.selectedBlob) {
    await saveBlobToGallery(state.danbooru.selectedBlob, `danbooru-${post.id || Date.now()}.png`);
    showToast('Original failed, saved preview instead.');
  } else {
    showToast(lastError?.message || 'Cannot save reference image', 'error');
  }
  state.danbooru.savingOriginal = false;
  if (state.activeTab === 'danbooru') renderActiveTab();
}

async function normalizeCurrentTags() {
  if (!state.danbooru.tagOutput.trim()) return showToast('No tags to clean.');
  try {
    const body = await normalizeTags(state.danbooru.tagOutput);
    state.danbooru.tagOutput = body.text || '';
    const output = document.querySelector('#tag-output');
    if (output) output.value = state.danbooru.tagOutput;
    showToast(`Cleaned ${body.count || 0} tags`);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function fillModule(moduleId, text) {
  if (!text.trim()) return showToast('No tags to fill.');
  if (!state.modules[moduleId]) state.modules[moduleId] = emptyModuleData();
  state.modules[moduleId].selectedIds = [];
  state.modules[moduleId].selectedId = '';
  state.modules[moduleId].draft = text;
  saveModules();
  showToast(`Filled ${state.moduleDefinitions.find((item) => item.id === moduleId)?.label || moduleId}`);
}

function currentDanbooruToken(value) {
  const match = value.match(/(?:^|\s)([^\s]*)$/);
  return match ? match[1] : '';
}

function replaceLastDanbooruToken(value, replacement) {
  return value.replace(/(?:^|\s)([^\s]*)$/, (segment) => {
    const prefix = segment.startsWith(' ') ? ' ' : '';
    return `${prefix}${replacement} `;
  });
}

async function copyText(text) {
  if (!text.trim()) return showToast('Nothing to copy.');
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied');
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    showToast('Copied');
  }
}

function renderSettings(view) {
  const comfyLabel = state.comfy?.running ? 'Running' : state.comfy?.starting ? 'Starting' : 'Stopped / Unknown';
  const busy = state.comfyBusy || Boolean(state.comfy?.starting);
  const busyText = state.comfyAction || (state.comfy?.starting ? 'Starting…' : '');
  const taggerLabel = state.tagger?.available ? `WD14: ${state.tagger.wd14?.class_type || 'available'}` : 'WD14 not detected';
  const apiKeyValue = state.apiKey?.api_key || '';
  view.innerHTML = `
    <section class="card">
      <div class="section-title"><span>Connection</span><small>${escapeHtml(serverHost())}</small></div>
      <div class="status-box">
        <span>ComfyUI</span>
        <b>${escapeHtml(comfyLabel)}</b>
      </div>
      ${busyText ? `<p class="inline-status">${escapeHtml(busyText)}</p>` : ''}
      <div class="row-actions wrap">
        <button id="refresh-comfy" class="secondary-btn" type="button" ${state.comfyBusy ? 'disabled' : ''}>Refresh</button>
        <button id="start-comfy" class="primary slim" type="button" ${busy || state.comfy?.running ? 'disabled' : ''}>${state.comfy?.starting ? 'Starting…' : 'Start ComfyUI'}</button>
        <button id="stop-comfy" class="danger-btn" type="button" ${state.comfyBusy ? 'disabled' : ''}>Stop</button>
        <button id="restart-comfy" class="danger-btn" type="button" ${busy ? 'disabled' : ''}>Restart</button>
      </div>
    </section>

    <section class="card">
      <div class="section-title"><span>Tagger</span><small>${escapeHtml(taggerLabel)}</small></div>
      <div class="status-box">
        <span>Reverse Tags</span>
        <b>${state.tagger?.available ? 'WD14 Ready' : 'Danbooru Tags Only'}</b>
      </div>
      <p class="inline-status">${escapeHtml(state.tagger?.message || 'Checking ComfyUI tagger nodes...')}</p>
      <button id="refresh-tagger" class="secondary-btn wide" type="button">Refresh Tagger Status</button>
    </section>

    <section class="card">
      <div class="section-title"><span>External API</span><small>Separate key</small></div>
      <label>API Key<input id="external-api-key" readonly value="${escapeHtml(apiKeyValue || (state.apiKeyLoading ? 'Loading...' : ''))}" placeholder="Load API key"></label>
      <div class="row-actions wrap">
        <button id="load-api-key" class="secondary-btn" type="button" ${state.apiKeyLoading ? 'disabled' : ''}>${apiKeyValue ? 'Refresh Key' : 'Load Key'}</button>
        <button id="copy-api-key" class="secondary-btn" type="button" ${apiKeyValue ? '' : 'disabled'}>Copy Key</button>
        <button id="rotate-api-key" class="danger-btn ghost" type="button" ${state.apiKeyLoading ? 'disabled' : ''}>Rotate</button>
      </div>
      <p class="inline-status">POST ${escapeHtml(session.server)}/api/external/generate with X-Canvas-API-Key.</p>
    </section>

    <section class="card">
      <div class="section-title"><span>Backup</span><small>Prompts and settings</small></div>
      <p class="inline-status">The backup contains prompt modules, LoRA selections, workflow selections, checkpoints and negative prompts. Pairing tokens are excluded.</p>
      <div class="row-actions wrap">
        <button id="export-backup" class="secondary-btn" type="button">Export Backup</button>
        <button id="import-backup" class="secondary-btn" type="button">Import Backup</button>
        <input id="backup-file" type="file" accept="application/json,.json" hidden>
      </div>
    </section>

    <section class="card">
      <div class="section-title"><span>Notes</span><small>Read once</small></div>
      <ul class="notes-list">
        <li>Canvas Gateway must stay running on the PC while the phone app is in use.</li>
        <li>Danbooru traffic is fetched by the PC gateway, so the phone does not need its own proxy.</li>
        <li>Gallery images are session cache. Save an image if you want it in Photos.</li>
        <li>Base Model follows the current workflow loader. This workflow currently exposes a UNET/base model input.</li>
        <li>ComfyUI start/stop commands run only on this configured PC.</li>
      </ul>
    </section>

    <section class="card">
      <div class="section-title"><span>Pairing</span></div>
      <button id="reset-pair" class="secondary-btn wide" type="button">Disconnect and Pair Again</button>
    </section>`;
  document.querySelector('#refresh-comfy').addEventListener('click', refreshComfyStatus);
  document.querySelector('#start-comfy').addEventListener('click', async () => {
    await runComfyAction(() => startComfy(), 'Start command sent');
  });
  document.querySelector('#stop-comfy').addEventListener('click', async () => {
    if (confirm('Stop ComfyUI? Current jobs will be interrupted.')) await runComfyAction(() => stopComfy(), 'Stop command sent');
  });
  document.querySelector('#restart-comfy').addEventListener('click', async () => {
    if (confirm('Restart ComfyUI? Current jobs will be interrupted.')) await runComfyAction(() => restartComfy(), 'Restart command sent');
  });
  document.querySelector('#refresh-tagger').addEventListener('click', refreshTaggerStatus);
  document.querySelector('#load-api-key').addEventListener('click', () => loadExternalApiKey(false));
  document.querySelector('#copy-api-key').addEventListener('click', () => copyText(state.apiKey?.api_key || ''));
  document.querySelector('#rotate-api-key').addEventListener('click', async () => {
    if (confirm('Rotate external API key? Existing scripts using the old key will stop working.')) await loadExternalApiKey(true);
  });
  document.querySelector('#export-backup').addEventListener('click', async () => {
    try { await exportAppBackup(); } catch (error) { showToast(error.message, 'error'); }
  });
  document.querySelector('#import-backup').addEventListener('click', () => document.querySelector('#backup-file').click());
  document.querySelector('#backup-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (!confirm('Import this backup and replace matching prompt/settings data?')) return;
      await importAppBackup(file);
      showToast('Backup imported. Reloading…');
      setTimeout(() => location.reload(), 500);
    } catch (error) { showToast(error.message, 'error'); }
  });
  document.querySelector('#reset-pair').addEventListener('click', () => {
    if (confirm('Disconnect this phone and pair again?')) {
      session.clear();
      setupView();
    }
  });
  if (!state.comfy) refreshComfyStatus();
  if (!state.tagger) refreshTaggerStatus();
  if (!state.apiKey && !state.apiKeyLoading) loadExternalApiKey(false);
}

async function refreshComfyStatus() {
  try {
    state.comfy = await comfyStatus();
    if (state.activeTab === 'settings') renderActiveTab();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function refreshTaggerStatus() {
  try {
    state.tagger = await taggerStatus();
    if (state.activeTab === 'settings') renderActiveTab();
  } catch (error) {
    state.tagger = { available: false, message: error.message };
    if (state.activeTab === 'settings') renderActiveTab();
  }
}

async function loadExternalApiKey(rotate = false) {
  if (state.apiKeyLoading) return;
  state.apiKeyLoading = true;
  if (state.activeTab === 'settings') renderActiveTab();
  try {
    state.apiKey = rotate ? await rotateExternalApiKey() : await getExternalApiKey();
    showToast(rotate ? 'External API key rotated' : 'External API key loaded');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.apiKeyLoading = false;
    if (state.activeTab === 'settings') renderActiveTab();
  }
}

async function runComfyAction(action, message) {
  if (state.comfyBusy) return;
  state.comfyBusy = true;
  state.comfyAction = message;
  if (state.activeTab === 'settings') renderActiveTab();
  try {
    const result = await action();
    showToast(result.message || message);
    state.comfy = await comfyStatus().catch(() => result || null);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.comfyBusy = false;
    state.comfyAction = '';
    renderActiveTab();
  }
}

window.addEventListener('beforeunload', () => {
  for (const item of state.gallery) {
    if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
  }
  revokeDanbooruObjects();
});

(async () => {
  if (!session.token) return setupView();
  try {
    const current = await health();
    if (!current.gateway) throw new Error('Gateway is not ready.');
    await renderMain();
  } catch (error) {
    showToast(error.message, 'error');
    setupView();
  }
})();
