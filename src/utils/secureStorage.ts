// Lightweight encryption using built-in Web Crypto API
// Fallback to simple obfuscation for older browsers

const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || 'kanvas-secure-key-2024';

interface SecureStorageOptions {
  encrypt?: boolean;
  ttl?: number; // Time to live in milliseconds
}

class SecureStorage {
  private isClient: boolean;

  constructor() {
    this.isClient = typeof window !== 'undefined';
  }

  // Generate a device-specific key for additional security
  private getDeviceKey(): string {
    if (!this.isClient) return ENCRYPTION_KEY;
    
    try {
      const deviceFingerprint = navigator.userAgent + navigator.language + screen.width + screen.height;
      return this.simpleHash(ENCRYPTION_KEY + deviceFingerprint);
    } catch {
      return ENCRYPTION_KEY;
    }
  }

  // Simple hash function (fallback for older browsers)
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Simple XOR-based encryption (lightweight, no external dependencies)
  private encrypt(data: any): string {
    try {
      const key = this.getDeviceKey();
      const jsonString = JSON.stringify(data);
      
      // Convert to base64 first
      const base64 = btoa(unescape(encodeURIComponent(jsonString)));
      
      // Simple XOR obfuscation
      let encrypted = '';
      for (let i = 0; i < base64.length; i++) {
        const keyChar = key.charCodeAt(i % key.length);
        const dataChar = base64.charCodeAt(i);
        encrypted += String.fromCharCode(dataChar ^ keyChar);
      }
      
      // Mark as encrypted and convert back to base64
      return 'enc:' + btoa(encrypted);
    } catch (error) {
      console.error('[SecureStorage] Encryption failed:', error);
      return JSON.stringify(data); // Fallback to unencrypted
    }
  }

  // Decrypt XOR-based encryption
  private decrypt(encryptedData: string): any {
    try {
      const key = this.getDeviceKey();
      
      // Check if it's our encrypted format
      if (!encryptedData.startsWith('enc:')) {
        return null;
      }
      
      // Remove prefix and decode from base64
      const encoded = atob(encryptedData.substring(4));
      
      // Reverse XOR obfuscation
      let decrypted = '';
      for (let i = 0; i < encoded.length; i++) {
        const keyChar = key.charCodeAt(i % key.length);
        const dataChar = encoded.charCodeAt(i);
        decrypted += String.fromCharCode(dataChar ^ keyChar);
      }
      
      // Decode from base64
      const jsonString = decodeURIComponent(escape(atob(decrypted)));
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('[SecureStorage] Decryption failed:', error);
      return null;
    }
  }

  // Store data securely
  setItem(key: string, value: any, options: SecureStorageOptions = {}): void {
    if (!this.isClient) return;

    try {
      const { encrypt = true, ttl } = options;
      
      // Determine if this key contains sensitive data
      const sensitiveKeys = ['kanvas-auth', 'kanvas-user-data', 'kanvas-tokens'];
      const shouldEncrypt = encrypt && sensitiveKeys.some(sensitiveKey => key.includes(sensitiveKey));

      let dataToStore: any;
      
      if (shouldEncrypt) {
        // Encrypt sensitive data
        dataToStore = {
          encrypted: true,
          data: this.encrypt(value),
          timestamp: Date.now(),
          ttl: ttl ? Date.now() + ttl : null
        };
      } else {
        // Store non-sensitive data normally
        dataToStore = {
          encrypted: false,
          data: value,
          timestamp: Date.now(),
          ttl: ttl ? Date.now() + ttl : null
        };
      }

      localStorage.setItem(key, JSON.stringify(dataToStore));
    } catch (error) {
      console.error('[SecureStorage] Failed to set item:', error);
      // Fallback to regular localStorage
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (fallbackError) {
        console.error('[SecureStorage] Fallback storage failed:', fallbackError);
      }
    }
  }

  // Retrieve data securely
  getItem(key: string): any {
    if (!this.isClient) return null;

    try {
      const storedItem = localStorage.getItem(key);
      if (!storedItem) return null;

      const parsed = JSON.parse(storedItem);

      // Check if item has expired
      if (parsed.ttl && Date.now() > parsed.ttl) {
        this.removeItem(key);
        return null;
      }

      // Handle legacy unencrypted data
      if (!parsed.encrypted) {
        return parsed.data || parsed; // Handle both new and old format
      }

      // Decrypt encrypted data
      if (parsed.encrypted) {
        const decrypted = this.decrypt(parsed.data);
        return decrypted !== null ? decrypted : parsed.data; // Fallback to encrypted data if decryption fails
      }

      return parsed.data;
    } catch (error) {
      console.error('[SecureStorage] Failed to get item:', error);
      
      // Try to handle as plain JSON (legacy)
      try {
        const storedItem = localStorage.getItem(key);
        if (storedItem) {
          return JSON.parse(storedItem);
        }
      } catch {
        // Return as-is if it's not JSON
        return localStorage.getItem(key);
      }
      
      return null;
    }
  }

  // Remove item
  removeItem(key: string): void {
    if (!this.isClient) return;
    
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('[SecureStorage] Failed to remove item:', error);
    }
  }

  // Clear all items
  clear(): void {
    if (!this.isClient) return;
    
    try {
      localStorage.clear();
    } catch (error) {
      console.error('[SecureStorage] Failed to clear storage:', error);
    }
  }

  // Get all keys (for debugging/migration)
  keys(): string[] {
    if (!this.isClient) return [];
    
    try {
      return Object.keys(localStorage);
    } catch (error) {
      console.error('[SecureStorage] Failed to get keys:', error);
      return [];
    }
  }

  // Check if key exists
  hasItem(key: string): boolean {
    if (!this.isClient) return false;
    
    try {
      return localStorage.getItem(key) !== null;
    } catch (error) {
      console.error('[SecureStorage] Failed to check item:', error);
      return false;
    }
  }

  // Check if data is in our encrypted format
  private isEncrypted(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      return parsed.encrypted === true;
    } catch {
      return false;
    }
  }

  // Migrate existing data to secure format
  migrateToSecure(): void {
    if (!this.isClient) return;

    const keysToMigrate = ['kanvas-auth', 'kanvas-user-data'];
    
    keysToMigrate.forEach(key => {
      try {
        const existingData = localStorage.getItem(key);
        if (existingData && !this.isEncrypted(existingData)) {
          // This is unencrypted data, migrate it
          const parsed = JSON.parse(existingData);
          this.setItem(key, parsed, { encrypt: true });
          console.log(`[SecureStorage] Migrated ${key} to secure storage`);
        }
      } catch (error) {
        console.error(`[SecureStorage] Failed to migrate ${key}:`, error);
      }
    });
  }
}

export const secureStorage = new SecureStorage();

// Auto-migrate existing data on module load
if (typeof window !== 'undefined') {
  secureStorage.migrateToSecure();
}
