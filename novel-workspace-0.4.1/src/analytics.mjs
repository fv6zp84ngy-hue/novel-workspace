const DB_NAME = 'novel-workspace-analytics-v1';
const STORE = 'events';
export const FUNNEL_VERSION = '0.4.1';
let lastTimestamp = 0;
const MAX_EVENTS = 10000;
const EVENTS = new Set([
  'onboarding_view', 'route_selected', 'entry_mode_selected', 'intent_submitted',
  'input_completed', 'import_started', 'import_succeeded', 'paste_saved',
  'workspace_created', 'first_artifact_ready', 'edit_saved', 'material_captured',
  'search_started', 'search_result_opened', 'material_linked', 'ai_enrichment_result',
  'first_value_completed', 'deep_interaction', 'scenario_impression', 'scenario_selected'
]);
const ROUTES = new Set(['new_story', 'migrate_existing']);
const ENTRY_MODES = new Set(['natural_language', 'template', 'blank', 'paste', 'file']);
export const SCENARIO_IDS = ['starter','character','outline','migration','world','timeline','clues','research'];
const ENUMS = {
  scenario_id: new Set(SCENARIO_IDS),
  source: new Set(['onboarding', 'editor', 'library', 'search', 'assistant']),
  result: new Set(['success', 'failure']),
  reason: new Set(['unavailable', 'not_configured', 'network', 'invalid_response']),
  import_format: new Set(['txt', 'md']),
  input_length_bucket: new Set(['0', '1_50', '51_200', '201_2000']),
  result_count_bucket: new Set(['0', '1', '2_5', '6_plus']),
  ai_result: new Set(['success', 'failure', 'not_configured']),
  save_state: new Set(['saved', 'failed']),
  kind: new Set(['chapter', 'outline', 'material'])
};
const BOOLEAN_PROPS = new Set(['ai_configured']);
const COUNT_PROPS = new Set(['character_count']);

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('session_id', 'session_id');
        store.createIndex('event_name', 'event_name');
      }
      const store = request.transaction.objectStore(STORE);
      if (!store.indexNames.contains('ts_ms')) store.createIndex('ts_ms', 'ts_ms');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本地漏斗库无法打开。'));
  });
}

export function startFunnelSession() {
  const id = crypto.randomUUID();
  sessionStorage.setItem('nw_session_id', id);
  sessionStorage.setItem('nw_session_scope', `${FUNNEL_VERSION}:${getVariant()}`);
  return id;
}

export function getSessionId() {
  const scope = `${FUNNEL_VERSION}:${getVariant()}`;
  if (sessionStorage.getItem('nw_session_scope') !== scope) return startFunnelSession();
  return sessionStorage.getItem('nw_session_id') || startFunnelSession();
}

export function getVariant() {
  const queryValue = new URLSearchParams(location.search).get('onboarding');
  if (queryValue === 'control' || queryValue === 'treatment') {
    sessionStorage.setItem('nw_onboarding_variant', queryValue);
    return queryValue;
  }
  const saved = sessionStorage.getItem('nw_onboarding_variant');
  return saved === 'control' || saved === 'treatment' ? saved : 'treatment';
}

export function bucketLength(length) {
  if (!Number.isFinite(length) || length <= 0) return '0';
  if (length <= 50) return '1_50';
  if (length <= 200) return '51_200';
  return '201_2000';
}

export function bucketCount(count) {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count === 1) return '1';
  if (count <= 5) return '2_5';
  return '6_plus';
}

export function sanitizeProps(props = {}) {
  const clean = {};
  if (!props || typeof props !== 'object' || Array.isArray(props)) return clean;
  for (const [key, value] of Object.entries(props)) {
    if (ENUMS[key]?.has(value)) clean[key] = value;
    else if (BOOLEAN_PROPS.has(key) && typeof value === 'boolean') clean[key] = value;
    else if (COUNT_PROPS.has(key) && Number.isInteger(value) && value >= 0 && value <= 250000) clean[key] = value;
  }
  return clean;
}

export async function track(eventName, context = {}, props = {}) {
  if (!EVENTS.has(eventName)) return null;
  const route = ROUTES.has(context.route) ? context.route : null;
  const entryMode = ENTRY_MODES.has(context.entry_mode) ? context.entry_mode : null;
  const event = {
    id: crypto.randomUUID(),
    event_name: eventName,
    ts_ms: (lastTimestamp = Math.max(Date.now(), lastTimestamp + 1)),
    session_id: getSessionId(),
    funnel_version: FUNNEL_VERSION,
    variant: getVariant(),
    route,
    entry_mode: entryMode,
    props: sanitizeProps(props)
  };
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.add(event);
      const count = store.count();
      count.onsuccess = () => {
        const removeCount = Math.max(0, count.result - MAX_EVENTS);
        if (!removeCount) return;
        let removed = 0;
        const cursorRequest = store.index('ts_ms').openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || removed >= removeCount) return;
          cursor.delete();
          removed += 1;
          cursor.continue();
        };
      };
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error('漏斗事件没有保存。'));
      tx.onerror = () => reject(tx.error || new Error('漏斗事件没有保存。'));
    });
  } finally {
    db.close();
  }
  window.dispatchEvent(new CustomEvent('nw:analytics', { detail: event }));
  return event;
}

export async function readAllEvents() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result.sort((a, b) => a.ts_ms - b.ts_ms));
      request.onerror = () => reject(request.error || new Error('漏斗事件无法读取。'));
    });
  } finally {
    db.close();
  }
}

export async function exportEvents() {
  const events = await readAllEvents();
  const blob = new Blob([JSON.stringify({ schema_version: 1, funnel_version: FUNNEL_VERSION, events }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `novel-workspace-funnel-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  return events.length;
}

export async function clearEvents() {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error('漏斗测试数据没有清除。'));
      tx.onerror = () => reject(tx.error || new Error('漏斗测试数据没有清除。'));
    });
  } finally {
    db.close();
  }
}
