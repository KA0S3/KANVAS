// Reliable connectivity detection using heartbeat checks
// Replaces unreliable navigator.onLine

import { supabase } from '@/lib/supabase';

interface ConnectivityState {
  isOnline: boolean;
  lastCheck: number;
  consecutiveFailures: number;
}

type ConnectivityEvent = 'online' | 'offline' | ConnectivityState;

class ConnectivityService {
  private static instance: ConnectivityService;
  private state: ConnectivityState;
  private heartbeatInterval: number | null = null;
  private subscribers: Set<(state: ConnectivityState) => void> = new Set();
  private syncTriggerTimeout: number | null = null; // Debounce timer for sync triggers
  
  // Configuration
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly FAILURE_THRESHOLD = 2; // 2 consecutive failures = offline
  private readonly HEARTBEAT_TIMEOUT = 10000; // 10 seconds timeout for each check
  private readonly MAX_OFFLINE_TIME = 300000; // 5 minutes max offline time
  
  static getInstance(): ConnectivityService {
    if (!ConnectivityService.instance) {
      ConnectivityService.instance = new ConnectivityService();
    }
    return ConnectivityService.instance;
  }

  private constructor() {
    this.state = {
      isOnline: navigator.onLine,
      lastCheck: Date.now(),
      consecutiveFailures: 0
    };
    
    this.setupEventListeners();
    this.startHeartbeat();
  }

  private setupEventListeners(): void {
    if (typeof window !== 'undefined') {
      // Listen to browser online/offline events as secondary check
      const handleOnline = () => {
        console.log('[Connectivity] Browser reports online');
        this.updateState({ isOnline: true, consecutiveFailures: 0 });
      };

      const handleOffline = () => {
        console.log('[Connectivity] Browser reports offline');
        this.updateState({ isOnline: false });
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Page visibility change - check connectivity when page becomes visible
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          console.log('[Connectivity] Page became visible, checking connectivity');
          this.checkConnectivityNow();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = window.setInterval(() => {
      this.performHeartbeat();
    }, this.HEARTBEAT_INTERVAL);

    console.log('[Connectivity] Started heartbeat checks');
  }

  private async performHeartbeat(): Promise<void> {
    try {
      const isOnline = await this.checkConnectivityNow();
      this.updateState({ 
        isOnline,
        lastCheck: Date.now(),
        consecutiveFailures: isOnline ? 0 : this.state.consecutiveFailures + 1
      });
    } catch (error) {
      console.error('[Connectivity] Heartbeat check failed:', error);
      this.updateState({ 
        isOnline: false,
        lastCheck: Date.now(),
        consecutiveFailures: this.state.consecutiveFailures + 1
      });
    }
  }

  private async checkConnectivityNow(): Promise<boolean> {
    // Use multiple methods for reliable connectivity detection with early success
    
    try {
      // Method 1: Try to reach our own health endpoint first (fastest)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.HEARTBEAT_TIMEOUT);

      const response = await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log('[Connectivity] Health endpoint successful');
        return true;
      }
    } catch (error) {
      console.log('[Connectivity] Health endpoint failed:', error);
    }

    try {
      // Method 2: DNS resolution check (faster than external fetch)
      const dnsCheck = await this.checkDNSResolution();
      if (dnsCheck) {
        console.log('[Connectivity] DNS resolution successful');
        return true;
      }
    } catch (error) {
      console.log('[Connectivity] DNS check failed:', error);
    }

    try {
      // Method 3: Try to reach a reliable external service
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.HEARTBEAT_TIMEOUT);

      const response = await fetch('https://api.github.com', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log('[Connectivity] External endpoint successful');
        return true;
      }
    } catch (error) {
      console.log('[Connectivity] External endpoint failed:', error);
    }

    // Method 4: Last resort - check if we can reach Supabase
    try {
      const { data } = await supabase.from('_health').select('count').limit(1);
      console.log('[Connectivity] Supabase check successful');
      return true;
    } catch (error) {
      console.log('[Connectivity] Supabase check failed:', error);
    }

    return false;
  }

  private async checkDNSResolution(): Promise<boolean> {
    // Use a simple DNS check by trying to resolve a known domain
    return new Promise((resolve) => {
      const img = new Image();
      const timeout = setTimeout(() => {
        resolve(false);
      }, this.HEARTBEAT_TIMEOUT);

      img.onload = () => {
        clearTimeout(timeout);
        resolve(true);
      };

      img.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };

      // Use Google's favicon as a reliable DNS check target
      img.src = 'https://www.google.com/favicon.ico?' + Date.now();
    });
  }

  private updateState(updates: Partial<ConnectivityState>): void {
    const previousState = { ...this.state };
    this.state = { ...this.state, ...updates };

    // Log significant state changes
    if (previousState.isOnline !== this.state.isOnline) {
      console.log(`[Connectivity] State changed: ${previousState.isOnline} -> ${this.state.isOnline}`);
      
      // Trigger online/offline events for other services
      if (this.state.isOnline && !previousState.isOnline) {
        this.notifySubscribers('online');
        // Trigger sync queue processing when coming back online with debounce
        this.debouncedSyncQueueTrigger();
      } else if (!this.state.isOnline && previousState.isOnline) {
        this.notifySubscribers('offline');
      }
    }

    // Notify all subscribers of state change
    this.notifySubscribers(this.state);
  }

  // Debounced sync queue trigger to prevent multiple rapid calls
  private debouncedSyncQueueTrigger(): void {
    if (this.syncTriggerTimeout) {
      clearTimeout(this.syncTriggerTimeout as number);
    }
    
    this.syncTriggerTimeout = setTimeout(() => {
      this.processSyncQueueOnReconnect();
    }, 2000) as unknown as number; // 2 second debounce
  }

  private processSyncQueueOnReconnect(): void {
    // Import dynamically to avoid circular dependency
    import('@/services/DocumentMutationService').then(({ documentMutationService }) => {
      if (documentMutationService) {
        console.log('[Connectivity] Triggering sync queue processing on reconnection');
        // Small delay to ensure everything is ready
        setTimeout(() => {
          // Trigger sync via DocumentMutationService
          documentMutationService.syncNow();
        }, 1000);
      }
    }).catch(error => {
      console.error('[Connectivity] Failed to import DocumentMutationService:', error);
    });
  }

  private notifySubscribers(event: ConnectivityEvent): void {
    this.subscribers.forEach(callback => {
      try {
        // Handle both string events and state objects
        if (typeof event === 'string') {
          // For 'online'/'offline' events, send current state
          callback(this.state);
        } else {
          // For state objects, send the state directly
          callback(event as ConnectivityState);
        }
      } catch (error) {
        console.error('[Connectivity] Subscriber callback error:', error);
      }
    });
  }

  // Public API
  subscribe(callback: (state: ConnectivityState) => void): () => void {
    this.subscribers.add(callback);
    callback(this.state); // Send current state immediately
    return () => this.subscribers.delete(callback);
  }

  getState(): ConnectivityState {
    return { ...this.state };
  }

  isOnline(): boolean {
    return this.state.isOnline && this.state.consecutiveFailures < this.FAILURE_THRESHOLD;
  }

  // Force immediate connectivity check
  async checkNow(): Promise<boolean> {
    return await this.checkConnectivityNow();
  }

  // Manual override for testing
  setOnline(online: boolean): void {
    console.log(`[Connectivity] Manual override: ${online ? 'online' : 'offline'}`);
    this.updateState({ 
      isOnline: online,
      consecutiveFailures: online ? 0 : this.FAILURE_THRESHOLD
    });
  }

  // Cleanup
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.subscribers.clear();
    
    // Remove event listeners
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', () => {});
      window.removeEventListener('offline', () => {});
      document.removeEventListener('visibilitychange', () => {});
    }
    
    console.log('[Connectivity] Service destroyed');
  }
}

export const connectivityService = ConnectivityService.getInstance();
