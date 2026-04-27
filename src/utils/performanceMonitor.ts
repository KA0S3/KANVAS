// Simple performance monitoring utility
interface PerformanceMetrics {
  databaseRequests: number;
  authRequests: number;
  syncOperations: number;
  bookCreations: number;
  lastResetTime: number;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics = {
    databaseRequests: 0,
    authRequests: 0,
    syncOperations: 0,
    bookCreations: 0,
    lastResetTime: Date.now(),
  };

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  incrementDatabaseRequests(): void {
    this.metrics.databaseRequests++;
  }

  incrementAuthRequests(): void {
    this.metrics.authRequests++;
  }

  incrementSyncOperations(): void {
    this.metrics.syncOperations++;
  }

  incrementBookCreations(): void {
    this.metrics.bookCreations++;
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  getMetricsSummary(): string {
    const elapsed = (Date.now() - this.metrics.lastResetTime) / 1000 / 60; // minutes
    return `
Performance Summary (${elapsed.toFixed(1)} minutes):
- Database Requests: ${this.metrics.databaseRequests}
- Auth Requests: ${this.metrics.authRequests}
- Sync Operations: ${this.metrics.syncOperations}
- Book Creations: ${this.metrics.bookCreations}
- DB Requests/min: ${(this.metrics.databaseRequests / elapsed).toFixed(1)}
- Auth Requests/min: ${(this.metrics.authRequests / elapsed).toFixed(1)}
    `.trim();
  }

  reset(): void {
    this.metrics = {
      databaseRequests: 0,
      authRequests: 0,
      syncOperations: 0,
      bookCreations: 0,
      lastResetTime: Date.now(),
    };
    console.log('[Performance] Metrics reset');
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
