const DEFAULT_SERVER = '';

export const session = {
  get server() {
    return localStorage.getItem('canvas.server') || DEFAULT_SERVER;
  },
  set server(value) {
    localStorage.setItem('canvas.server', value.replace(/\/$/, ''));
  },
  get token() {
    return localStorage.getItem('canvas.token') || '';
  },
  set token(value) {
    localStorage.setItem('canvas.token', value);
  },
  clear() {
    localStorage.removeItem('canvas.token');
  },
};

export function apiUrl(path) {
  return `${session.server}${path}`;
}

async function request(path, options = {}, authenticated = true) {
  const { timeoutMs = 30000, ...fetchOptions } = options;
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (authenticated && session.token) headers.set('Authorization', `Bearer ${session.token}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(apiUrl(path), {
      ...fetchOptions,
      headers,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: fetchOptions.signal || controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Request timed out. Check Tailscale, Canvas Gateway, and the PC network.');
    }
    throw new Error('Cannot reach the PC. Check Tailscale, Canvas Gateway, and proxy/VPN status.');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch {}
    if (response.status === 401) session.clear();
    throw new Error(message);
  }
  return response;
}

export async function health() {
  return (await request('/api/health', {}, false)).json();
}

export async function pair(server, code) {
  session.server = server;
  const response = await request('/api/pair', { method: 'POST', body: JSON.stringify({ code }) }, false);
  const body = await response.json();
  session.token = body.token;
  return body;
}

export async function loadConfig() {
  return (await request('/api/config')).json();
}

export async function getExternalApiKey() {
  return (await request('/api/external/key')).json();
}

export async function rotateExternalApiKey() {
  return (await request('/api/external/key/rotate', { method: 'POST', body: '{}' })).json();
}

export async function listLoras() {
  return (await request('/api/loras')).json();
}

export async function listWorkflows() {
  return (await request('/api/workflows')).json();
}

export async function listCheckpoints(workflow = '') {
  const params = workflow ? `?${new URLSearchParams({ workflow })}` : '';
  return (await request(`/api/checkpoints${params}`)).json();
}

export async function generate(payload) {
  return (await request('/api/generate', { method: 'POST', body: JSON.stringify(payload), timeoutMs: 45000 })).json();
}

export async function getJob(jobId) {
  return (await request(`/api/jobs/${jobId}`)).json();
}

export async function listJobImages(jobId) {
  return (await request(`/api/jobs/${jobId}/images`, { timeoutMs: 45000 })).json();
}

export async function getImage(jobId, index = 0) {
  const path = index === 0 ? `/api/jobs/${jobId}/image` : `/api/jobs/${jobId}/image/${index}`;
  return (await request(`${path}?variant=display`, { timeoutMs: 60000 })).blob();
}

export function jobImageUrl(jobId, index = 0, variant = 'display', access = '') {
  const path = index === 0 ? `/api/jobs/${jobId}/image` : `/api/jobs/${jobId}/image/${index}`;
  const params = new URLSearchParams({ variant });
  if (access) params.set('access', access);
  return apiUrl(`${path}?${params}`);
}

export async function getOriginalImage(jobId, index = 0) {
  const path = index === 0 ? `/api/jobs/${jobId}/image` : `/api/jobs/${jobId}/image/${index}`;
  return (await request(`${path}?variant=original`, { timeoutMs: 120000 })).blob();
}

export async function deleteJob(jobId) {
  await request(`/api/jobs/${jobId}`, { method: 'DELETE' });
}

export async function comfyStatus() {
  return (await request('/api/comfy/status')).json();
}

export async function startComfy() {
  return (await request('/api/comfy/start', { method: 'POST', body: '{}', timeoutMs: 45000 })).json();
}

export async function stopComfy() {
  return (await request('/api/comfy/stop', { method: 'POST', body: '{}' })).json();
}

export async function restartComfy() {
  return (await request('/api/comfy/restart', { method: 'POST', body: '{}', timeoutMs: 60000 })).json();
}

export async function searchDanbooru(tags, page = 1, limit = 40) {
  const params = new URLSearchParams({ tags, page: String(page), limit: String(limit) });
  return (await request(`/api/danbooru/search?${params}`, { timeoutMs: 45000 })).json();
}

export async function autocompleteDanbooru(query, limit = 10) {
  const params = new URLSearchParams({ query, limit: String(limit) });
  return (await request(`/api/danbooru/autocomplete?${params}`)).json();
}

export async function getDanbooruImage(url) {
  const params = new URLSearchParams({ url });
  return (await request(`/api/danbooru/image?${params}`, { timeoutMs: 60000 })).blob();
}

export async function taggerStatus() {
  return (await request('/api/tagger/status')).json();
}

export async function interrogateTags(image, filename = 'canvas-wd14.png', options = {}) {
  return (await request('/api/tagger/interrogate', {
    method: 'POST',
    body: JSON.stringify({ image, filename, ...options }),
    timeoutMs: 600000,
  })).json();
}

export async function normalizeTags(text) {
  return (await request('/api/tagger/normalize', { method: 'POST', body: JSON.stringify({ text }) })).json();
}
