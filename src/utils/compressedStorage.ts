/**
 * Compressed storage utilities to reduce localStorage usage
 * No external dependencies - uses native IndexedDB
 */

const DB_NAME = 'kanvas-storage-v2';
const STORE_NAME = 'data';
const DB_VERSION = 1;

interface StorageEntry {
  data: string;
  timestamp: number;
}

// Simple dictionary-based compression
const COMPRESSION_PAIRS: [string, string][] = [
  ['"position":', '"pos":'],
  ['"customFields":', '"cf":'],
  ['"isExpanded":', '"exp":'],
  ['"backgroundConfig":', '"bgc":'],
  ['"parentId":', '"pid":'],
  ['"zIndex":', '"z":'],
  ['"createdAt":', '"ca":'],
  ['"updatedAt":', '"ua":'],
  ['"viewportOffset":', '"vo":'],
  ['"viewportScale":', '"vs":'],
  ['"globalCustomFields":', '"gcf":'],
  ['"worldData":', '"wd":'],
  ['"assets":', '"as":'],
  ['"tags":', '"tg":'],
  ['"backgrounds":', '"bgs":'],
  ['"color":', '"c":'],
  ['"mode":', '"m":'],
  ['"imageUrl":', '"iu":'],
  ['"edgeOpacity":', '"eo":'],
  ['"innerRadius":', '"ir":'],
  ['"outerRadius":', '"or":'],
  ['"gridSize":', '"gs":'],
  ['"scale":', '"sc":'],
  [',"x":', ',"x":'], // Keep coordinate keys short
  [',"y":', ',"y":'],
  ['"width":', '"w":'],
  ['"height":', '"h":'],
  ['true,', '1,'],
  ['false,', '0,'],
  ['true}', '1}'],
  ['false}', '0}'],
  ['true]', '1]'],
  ['false]', '0]'],
];

function compress(str: string): string {
  let compressed = str;
  for (const [original, short] of COMPRESSION_PAIRS) {
    compressed = compressed.split(original).join(short);
  }
  return compressed;
}

function decompress(str: string): string {
  let decompressed = str;
  // Reverse order for decompression
  for (let i = COMPRESSION_PAIRS.length - 1; i >= 0; i--) {
    const [original, short] = COMPRESSION_PAIRS[i];
    decompressed = decompressed.split(short).join(original);
  }
  return decompressed;
}

// Native IndexedDB wrapper
class IDBStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  private async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });

    return this.initPromise;
  }

  async getItem(key: string): Promise<string | null> {
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry: StorageEntry | undefined = request.result;
        resolve(entry ? decompress(entry.data) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('IDB not initialized');

    const compressed = compress(value);

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const entry: StorageEntry = { data: compressed, timestamp: Date.now() };
      const request = store.put(entry, key);

      request.onsuccess = () => {
        const savings = ((1 - compressed.length / value.length) * 100).toFixed(1);
        console.log(`[IDBStorage] ${key}: ${value.length} → ${compressed.length} bytes (${savings}% smaller)`);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async removeItem(key: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Singleton instance
const idbStorage = new IDBStorage();

import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * Storage interface compatible with Zustand's persist middleware
 * Falls back to localStorage for critical data, uses IndexedDB for large data
 */
export const hybridStorage: PersistStorage<unknown> = {
  getItem: async (name: string): Promise<StorageValue<unknown> | null> => {
    try {
      // Try IndexedDB first
      const idbValue = await idbStorage.getItem(name);
      if (idbValue !== null) {
        return JSON.parse(idbValue) as StorageValue<unknown>;
      }
      
      // Fallback to localStorage for migration/compatibility
      const localValue = localStorage.getItem(name);
      return localValue ? JSON.parse(localValue) : null;
    } catch (error) {
      console.error(`[hybridStorage] Error reading ${name}:`, error);
      try {
        const localValue = localStorage.getItem(name);
        return localValue ? JSON.parse(localValue) : null;
      } catch (localError) {
        console.error(`[hybridStorage] Error reading ${name} from localStorage fallback:`, localError);
        return null;
      }
    }
  },

  setItem: async (name: string, value: StorageValue<unknown>): Promise<void> => {
    try {
      const serialized = JSON.stringify(value);
      // Store in IndexedDB (unlimited quota)
      await idbStorage.setItem(name, serialized);
      
      // Also keep a small reference in localStorage for quick check
      localStorage.setItem(`${name}-ref`, `idb:${Date.now()}`);
    } catch (error) {
      console.error(`[hybridStorage] Error saving ${name}:`, error);
      // Fallback to localStorage
      localStorage.setItem(name, JSON.stringify(value));
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      await idbStorage.removeItem(name);
      localStorage.removeItem(`${name}-ref`);
      localStorage.removeItem(name);
    } catch (error) {
      console.error(`[hybridStorage] Error removing ${name}:`, error);
    }
  },
};

/**
 * Get storage usage breakdown
 */
export async function getStorageStats(): Promise<{
  localStorage: { used: number; total: number; keys: string[] };
  indexedDB: { entries: { name: string; size: number }[]; totalSize: number };
}> {
  // localStorage stats
  let localUsed = 0;
  const localKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      localKeys.push(key);
      localUsed += localStorage.getItem(key)?.length || 0;
    }
  }

  // IndexedDB stats
  const idbEntries: { name: string; size: number }[] = [];
  let idbTotal = 0;
  
  try {
    await idbStorage['init']();
    const db = (idbStorage as any).db as IDBDatabase;
    if (db) {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      
      for (const key of keys) {
        const entry: StorageEntry = await new Promise((resolve, reject) => {
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        if (entry) {
          idbEntries.push({ name: String(key), size: entry.data.length });
          idbTotal += entry.data.length;
        }
      }
    }
  } catch (e) {
    console.warn('[getStorageStats] Could not read IndexedDB:', e);
  }

  return {
    localStorage: {
      used: localUsed,
      total: 5 * 1024 * 1024, // 5MB estimate
      keys: localKeys,
    },
    indexedDB: {
      entries: idbEntries.sort((a, b) => b.size - a.size),
      totalSize: idbTotal,
    },
  };
}
