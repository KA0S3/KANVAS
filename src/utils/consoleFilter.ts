/**
 * Console filtering to reduce log spam during development
 */

export class ConsoleFilter {
  private static originalConsole = { ...console };
  private static logCounts: Map<string, number> = new Map();
  private static lastLogTime: Map<string, number> = new Map();
  private static readonly THROTTLE_MS = 1000; // 1 second
  private static readonly MAX_REPEATS = 3; // Max repeats per second

  /**
   * Enable console filtering to reduce spam
   */
  static enableFiltering(): void {
    // Override console.log
    console.log = (...args: any[]) => {
      this.filterLog('log', ...args);
    };

    // Override console.warn
    console.warn = (...args: any[]) => {
      this.filterLog('warn', ...args);
    };

    // Override console.error for non-critical errors
    console.error = (...args: any[]) => {
      // Only filter specific error patterns
      const message = args.join(' ');
      if (this.shouldFilterError(message)) {
        this.filterLog('error', ...args);
      } else {
        this.originalConsole.error(...args);
      }
    };
  }

  /**
   * Disable filtering and restore original console
   */
  static disableFiltering(): void {
    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
  }

  /**
   * Filter and throttle logs
   */
  private static filterLog(level: 'log' | 'warn' | 'error', ...args: any[]): void {
    const message = args.join(' ');
    const key = this.getLogKey(message);
    const now = Date.now();

    // Get current count and last time
    const count = this.logCounts.get(key) || 0;
    const lastTime = this.lastLogTime.get(key) || 0;

    // Check if we should throttle this log
    if (now - lastTime < this.THROTTLE_MS) {
      if (count >= this.MAX_REPEATS) {
        // Skip this log - we've shown it enough times
        return;
      }
    } else {
      // Reset count if enough time has passed
      this.logCounts.set(key, 0);
    }

    // Update tracking
    this.logCounts.set(key, count + 1);
    this.lastLogTime.set(key, now);

    // Show the log
    this.originalConsole[level](...args);
  }

  /**
   * Check if an error should be filtered
   */
  private static shouldFilterError(message: string): boolean {
    const filterPatterns = [
      /Cannot update a component.*while rendering/,
      /QuotaExceededError.*background/,
      /Warning.*Missing.*Description.*DialogContent/,
      /React Router Future Flag Warning/,
    ];

    return filterPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Generate a consistent key for log messages
   */
  private static getLogKey(message: string): string {
    // Extract key patterns for similar messages
    if (message.includes('AssetCreationModal: Using screen dimensions')) {
      return 'asset-creation-dimensions';
    }
    if (message.includes('AssetCreationModal: Calculated screen center')) {
      return 'asset-creation-position';
    }
    if (message.includes('AssetPort: Effective viewport size changed')) {
      return 'asset-port-viewport';
    }
    if (message.includes('AssetPort: Currently in asset')) {
      return 'asset-port-current';
    }
    if (message.includes('authStore: Auth store already initialized')) {
      return 'auth-store-initialized';
    }

    // Return first 50 chars as key for other messages
    return message.substring(0, 50);
  }

  /**
   * Get current log statistics
   */
  static getLogStats(): { [key: string]: number } {
    const stats: { [key: string]: number } = {};
    this.logCounts.forEach((count, key) => {
      stats[key] = count;
    });
    return stats;
  }

  /**
   * Reset log statistics
   */
  static resetStats(): void {
    this.logCounts.clear();
    this.lastLogTime.clear();
  }
}
