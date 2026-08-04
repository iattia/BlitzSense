interface CacheEntry<T> {
  value: T;
  savedAt: number;
}

const DB_NAME = 'blitzsense-cache';
const STORE_NAME = 'entries';
const DB_VERSION = 1;

function openCache(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function getPersistentCache<T>(namespace: string, key: string, maxAgeMs: number): Promise<T | null> {
  const database = await openCache();
  if (!database) return null;
  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const cacheKey = `${namespace}:${key}`;
    const request = store.get(cacheKey);
    request.onsuccess = () => {
      const entry = request.result as CacheEntry<T> | undefined;
      if (!entry || Date.now() - entry.savedAt > maxAgeMs) {
        if (entry) store.delete(cacheKey);
        resolve(null);
      } else {
        resolve(entry.value);
      }
    };
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => database.close();
  });
}

export async function setPersistentCache<T>(namespace: string, key: string, value: T): Promise<void> {
  const database = await openCache();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({ value, savedAt: Date.now() } satisfies CacheEntry<T>, `${namespace}:${key}`);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); resolve(); };
  });
}
