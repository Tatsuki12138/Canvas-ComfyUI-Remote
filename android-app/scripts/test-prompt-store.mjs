import assert from 'node:assert/strict';
import {
  LEGACY_MODULE_STORAGE_KEY,
  PROMPT_STORE_KEY,
  importBatchItems,
  loadPromptStore,
  parseBatchImport,
} from '../src/prompt-store.js';

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const freshStorage = new MemoryStorage();
const fresh = loadPromptStore(freshStorage);
for (const definition of fresh.definitions) {
  assert.equal(fresh.modules[definition.id].groups.length, 0, `${definition.id} must not contain a bundled group`);
  assert.equal(fresh.modules[definition.id].items.length, 0, `${definition.id} must not contain a bundled prompt`);
  assert.equal(fresh.modules[definition.id].draft, '', `${definition.id} must not contain a bundled draft`);
}

const legacy = {
  quality: { items: [{ id: 'q1', name: 'Keep me', content: 'quality', selectedIds: [] }], selectedIds: ['q1'] },
  ip: { items: [{ id: 'ip1', name: 'Delete me', content: 'old ip' }], selectedIds: ['ip1'] },
};
const storage = new MemoryStorage({ [LEGACY_MODULE_STORAGE_KEY]: JSON.stringify(legacy) });
const migrated = loadPromptStore(storage);
assert.equal(migrated.modules.quality.items[0].name, 'Keep me');
assert.equal(migrated.modules.ip, undefined);
assert.equal(migrated.modules.camera.items.length, 0);
assert.equal(migrated.modules.character.items.length, 0);
assert.equal(migrated.modules.character.groups.length, 0);
assert.equal(storage.getItem(LEGACY_MODULE_STORAGE_KEY), null);
assert.ok(storage.getItem(PROMPT_STORE_KEY));

const savedOnce = JSON.parse(storage.getItem(PROMPT_STORE_KEY));
savedOnce.definitions.push({ id: 'custom-test', label: 'Custom', builtin: false });
savedOnce.modules['custom-test'] = { groups: [], items: [{ id: 'c1', name: 'Custom item', content: 'kept', groupIds: [] }] };
storage.setItem(PROMPT_STORE_KEY, JSON.stringify(savedOnce));
const loadedAgain = loadPromptStore(storage);
assert.equal(loadedAgain.modules['custom-test'].items[0].content, 'kept');
assert.equal(loadedAgain.modules.character.items.length, 0, 'an empty prompt module must remain empty');

const parsed = parseBatchImport('One\talpha, beta\nTwo\tgamma');
assert.equal(parsed.errors.length, 0);
assert.deepEqual(parsed.entries.map((item) => item.name), ['One', 'Two']);
assert.equal(parseBatchImport('missing separator').errors.length, 1);

const grouped = {
  groups: [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }],
  items: [{ id: 'one', name: 'One', content: 'old', groupIds: ['g1'] }],
  selectedIds: [], draft: '', activeGroupId: '',
};
const imported = importBatchItems(grouped, parsed.entries, ['g1', 'g2'], 'rename', (() => { let i = 0; return () => `new-${++i}`; })());
assert.equal(imported.result.added, 2);
assert.equal(imported.result.renamed, 1);
assert.deepEqual(imported.data.items.at(-1).groupIds, ['g1', 'g2']);
assert.equal(imported.data.items[1].name, 'One (2)');

const overwritten = importBatchItems(grouped, [{ name: 'One', content: 'new' }], ['g2'], 'overwrite', () => 'unused');
assert.equal(overwritten.data.items[0].content, 'new');
assert.deepEqual(overwritten.data.items[0].groupIds, ['g2']);
const skipped = importBatchItems(grouped, [{ name: 'One', content: 'ignored' }], [], 'skip', () => 'unused');
assert.equal(skipped.result.skipped, 1);
assert.equal(skipped.data.items[0].content, 'old');

console.log('prompt-store tests passed');
