interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class LocalCache {
  private readonly prefix = 'kanvas-cache-';

  set<T>(key: string, data: T, ttlMinutes: number = 30): void {
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttlMinutes * 60 * 1000, // Convert minutes to milliseconds
    };

    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(item));
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
    }
  }

  get<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(this.prefix + key);
      if (!item) return null;

      const parsedItem: CacheItem<T> = JSON.parse(item);
      const now = Date.now();

      // Check if the item has expired
      if (now - parsedItem.timestamp > parsedItem.ttl) {
        this.remove(key);
        return null;
      }

      return parsedItem.data;
    } catch (error) {
      console.warn('Failed to read from localStorage:', error);
      this.remove(key);
      return null;
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (error) {
      console.warn('Failed to remove from localStorage:', error);
    }
  }

  clear(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
    }
  }

  // Check if a key exists and is not expired
  isValid(key: string): boolean {
    return this.get(key) !== null;
  }
}

export const localCache = new LocalCache();
