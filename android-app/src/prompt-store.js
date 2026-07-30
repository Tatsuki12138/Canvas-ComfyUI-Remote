export const PROMPT_STORE_KEY = 'canvas.prompt.store.v3';
export const LEGACY_MODULE_STORAGE_KEY = 'canvas.prompt.modules.v2';

export const BUILTIN_MODULES = [
  { id: 'quality', label: 'Quality Prefix', builtin: true },
  { id: 'artist', label: 'Artist String', builtin: true },
  { id: 'camera', label: '镜头控制', builtin: true },
  { id: 'character', label: 'Character Tags', builtin: true },
  { id: 'reference', label: 'Reference Tags', builtin: true },
  { id: 'natural', label: 'Natural Description', builtin: true },
];

export const BLUE_ARCHIVE_GROUP = { id: 'builtin-blue-archive', name: '蔚蓝档案' };

export const BLUE_ARCHIVE_PRESETS = [
  ['shiroko', '白子', 'shiroko \\(blue archive\\)'],
  ['ichika', '一花', 'ichika \\(blue archive\\)'],
  ['mika', '未花', 'mika \\(blue archive\\)'],
  ['hina', '日奈', 'hina \\(blue archive\\)'],
  ['yuuka', '优香', 'yuuka \\(blue archive\\)'],
  ['toki', '时', 'toki \\(blue archive\\)'],
  ['asuna', '明日奈', 'asuna \\(blue archive\\)'],
  ['rio', '莉音', 'rio \\(blue archive\\)'],
  ['kisaki', '妃咲', 'kisaki \\(blue archive\\)'],
  ['saori', '纱织', 'saori \\(blue archive\\)'],
  ['hikari', '光', 'hikari \\(blue archive\\)'],
  ['nozomi', '望', 'nozomi \\(blue archive\\)'],
].map(([key, name, content]) => ({
  id: `builtin-blue-archive-${key}`,
  name,
  content,
  groupIds: [BLUE_ARCHIVE_GROUP.id],
}));

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value))];
}

export function emptyModuleData() {
  return { groups: [], items: [], selectedIds: [], selectedId: '', draft: '', activeGroupId: '' };
}

function normalizeDefinition(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').trim();
  const label = String(value.label || '').trim();
  if (!id || !label || id === 'ip') return null;
  const builtin = BUILTIN_MODULES.some((item) => item.id === id);
  return { id, label: builtin ? BUILTIN_MODULES.find((item) => item.id === id).label : label, builtin };
}

export function normalizeModuleData(value = {}) {
  const groups = [];
  const groupIds = new Set();
  for (const candidate of Array.isArray(value.groups) ? value.groups : []) {
    const id = String(candidate?.id || '').trim();
    const name = String(candidate?.name || '').trim();
    if (!id || !name || groupIds.has(id)) continue;
    groups.push({ id, name });
    groupIds.add(id);
  }

  const items = [];
  const itemIds = new Set();
  for (const candidate of Array.isArray(value.items) ? value.items : []) {
    const id = String(candidate?.id || '').trim();
    const name = String(candidate?.name || '').trim();
    if (!id || !name || itemIds.has(id)) continue;
    items.push({
      id,
      name,
      content: String(candidate?.content || ''),
      groupIds: uniqueStrings(candidate?.groupIds).filter((groupId) => groupIds.has(groupId)),
    });
    itemIds.add(id);
  }

  const selectedIds = uniqueStrings(value.selectedIds?.length ? value.selectedIds : (value.selectedId ? [value.selectedId] : []))
    .filter((id) => itemIds.has(id));
  const activeGroupId = groupIds.has(value.activeGroupId) ? value.activeGroupId : '';
  return {
    groups,
    items,
    selectedIds,
    selectedId: selectedIds[0] || '',
    draft: String(value.draft || ''),
    activeGroupId,
  };
}

function seedBlueArchive(store) {
  store.seeds = store.seeds && typeof store.seeds === 'object' ? store.seeds : {};
  if (store.seeds.blueArchiveV1) return;
  const character = store.modules.character || emptyModuleData();
  if (!character.groups.some((group) => group.id === BLUE_ARCHIVE_GROUP.id)) {
    character.groups.push({ ...BLUE_ARCHIVE_GROUP });
  }
  for (const preset of BLUE_ARCHIVE_PRESETS) {
    if (character.items.some((item) => item.id === preset.id || item.content === preset.content)) continue;
    const sameName = character.items.some((item) => item.name.trim().toLowerCase() === preset.name.toLowerCase());
    character.items.push({ ...preset, name: sameName ? `${preset.name} · Danbooru` : preset.name });
  }
  store.modules.character = character;
  store.seeds.blueArchiveV1 = true;
}

export function normalizePromptStore(raw = {}) {
  const customDefinitions = (Array.isArray(raw.definitions) ? raw.definitions : [])
    .map(normalizeDefinition)
    .filter((item) => item && !item.builtin);
  const seen = new Set(BUILTIN_MODULES.map((item) => item.id));
  const definitions = BUILTIN_MODULES.map((item) => ({ ...item }));
  for (const item of customDefinitions) {
    if (seen.has(item.id)) continue;
    definitions.push(item);
    seen.add(item.id);
  }
  const modules = {};
  for (const definition of definitions) {
    modules[definition.id] = normalizeModuleData(raw.modules?.[definition.id]);
  }
  const store = { version: 3, definitions, modules, seeds: { ...(raw.seeds || {}) } };
  seedBlueArchive(store);
  return store;
}

export function migrateLegacyModules(legacy = {}) {
  const modules = {};
  for (const definition of BUILTIN_MODULES) {
    modules[definition.id] = normalizeModuleData(definition.id === 'camera' ? {} : legacy?.[definition.id]);
  }
  return normalizePromptStore({ version: 3, definitions: BUILTIN_MODULES, modules, seeds: {} });
}

export function loadPromptStore(storage = localStorage) {
  try {
    const current = JSON.parse(storage.getItem(PROMPT_STORE_KEY) || 'null');
    if (current) {
      const normalized = normalizePromptStore(current);
      storage.setItem(PROMPT_STORE_KEY, JSON.stringify(normalized));
      storage.removeItem(LEGACY_MODULE_STORAGE_KEY);
      return normalized;
    }
  } catch {}

  let legacy = {};
  try { legacy = JSON.parse(storage.getItem(LEGACY_MODULE_STORAGE_KEY) || '{}'); } catch {}
  const migrated = migrateLegacyModules(legacy);
  storage.setItem(PROMPT_STORE_KEY, JSON.stringify(migrated));
  storage.removeItem(LEGACY_MODULE_STORAGE_KEY);
  return migrated;
}

export function savePromptStore(store, storage = localStorage) {
  const normalized = normalizePromptStore(store);
  storage.setItem(PROMPT_STORE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function parseBatchImport(text) {
  const entries = [];
  const errors = [];
  String(text || '').split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const tabIndex = rawLine.indexOf('\t');
    if (tabIndex <= 0) {
      errors.push(`Line ${index + 1}: use a Tab between name and prompt.`);
      return;
    }
    const name = rawLine.slice(0, tabIndex).trim();
    const content = rawLine.slice(tabIndex + 1).trim();
    if (!name || !content) errors.push(`Line ${index + 1}: name and prompt are both required.`);
    else entries.push({ name, content });
  });
  return { entries, errors };
}

function renamedPresetName(items, original) {
  const names = new Set(items.map((item) => item.name.trim().toLowerCase()));
  let index = 2;
  let candidate = `${original} (${index})`;
  while (names.has(candidate.toLowerCase())) candidate = `${original} (${++index})`;
  return candidate;
}

export function importBatchItems(moduleData, entries, groupIds = [], conflict = 'rename', createId = () => crypto.randomUUID()) {
  const data = normalizeModuleData(moduleData);
  const validGroupIds = uniqueStrings(groupIds).filter((id) => data.groups.some((group) => group.id === id));
  const result = { added: 0, overwritten: 0, skipped: 0, renamed: 0 };
  for (const entry of entries) {
    const existing = data.items.find((item) => item.name.trim().toLowerCase() === entry.name.trim().toLowerCase());
    if (existing && conflict === 'skip') {
      result.skipped += 1;
      continue;
    }
    if (existing && conflict === 'overwrite') {
      existing.content = entry.content;
      existing.groupIds = [...validGroupIds];
      result.overwritten += 1;
      continue;
    }
    const name = existing ? renamedPresetName(data.items, entry.name) : entry.name;
    data.items.push({ id: createId(), name, content: entry.content, groupIds: [...validGroupIds] });
    result.added += 1;
    if (existing) result.renamed += 1;
  }
  return { data, result };
}
