/**
 * SILENT CONSOLE - Complete log suppression for production
 */

interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  args: any[];
}

class SilentConsole {
  private static instance: SilentConsole;
  private logHistory: LogEntry[] = [];
  private maxHistory = 100;
  private enabled = false;
  private suppressedPatterns = [
    /background/i,
    /backgroundconfig/i,
    /backgroundmap/i,
    /backgroundcontrols/i,
    /assetport/i,
    /getbackground/i,
    /setbackground/i,
    /backgroundstorage/i,
    /position.*x.*y/i,
    /scale.*\d+/i,
    /rendered/i,
    /viewport/i,
    /coordinate/i,
    /transform/i,
    // Add more patterns as needed
  ];

  private constructor() {
    this.setupInterceptors();
  }

  static getInstance(): SilentConsole {
    if (!SilentConsole.instance) {
      SilentConsole.instance = new SilentConsole();
    }
    return SilentConsole.instance;
  }

  enable() {
    this.enabled = true;
    console.log('🔇 Silent Console enabled - infinite logs suppressed');
  }

  disable() {
    this.enabled = false;
    console.log('🔊 Silent Console disabled');
  }

  private shouldSuppress(message: string): boolean {
    if (!this.enabled) return false;
    
    return this.suppressedPatterns.some(pattern => 
      pattern.test(message)
    );
  }

  private addToHistory(level: string, message: string, args: any[]) {
    this.logHistory.push({
      timestamp: Date.now(),
      level,
      message,
      args: args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      )
    });

    // Keep only recent entries
    if (this.logHistory.length > this.maxHistory) {
      this.logHistory = this.logHistory.slice(-this.maxHistory);
    }
  }

  private setupInterceptors() {
    // Store original console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;
    const originalDebug = console.debug;

    // Override console.log
    console.log = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');

      this.addToHistory('log', message, args);

      if (this.shouldSuppress(message)) {
        return; // Suppress the log
      }

      // Allow important logs through
      if (message.includes('🔇') || message.includes('🔊') || 
          message.includes('ERROR') || message.includes('CRITICAL')) {
        originalLog.apply(console, args);
      }
    };

    // Override console.warn
    console.warn = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');

      this.addToHistory('warn', message, args);

      if (this.shouldSuppress(message)) {
        return; // Suppress the log
      }

      originalWarn.apply(console, args);
    };

    // Override console.error
    console.error = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');

      this.addToHistory('error', message, args);

      // Allow errors through unless they're background-related
      if (this.shouldSuppress(message) && !message.includes('QuotaExceededError')) {
        return; // Suppress the log
      }

      originalError.apply(console, args);
    };

    // Override console.info
    console.info = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');

      this.addToHistory('info', message, args);

      if (this.shouldSuppress(message)) {
        return; // Suppress the log
      }

      originalInfo.apply(console, args);
    };

    // Override console.debug
    console.debug = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');

      this.addToHistory('debug', message, args);

      if (this.shouldSuppress(message)) {
        return; // Suppress the log
      }

      originalDebug.apply(console, args);
    };
  }

  // Debug methods to check what's being suppressed
  getRecentLogs(count = 20): LogEntry[] {
    return this.logHistory.slice(-count);
  }

  getSuppressedCount(): number {
    return this.logHistory.filter(log => 
      this.shouldSuppress(log.message)
    ).length;
  }

  clearHistory() {
    this.logHistory = [];
  }

  // Add custom suppression patterns
  addSuppressionPattern(pattern: RegExp) {
    this.suppressedPatterns.push(pattern);
  }

  // Remove suppression pattern
  removeSuppressionPattern(pattern: RegExp) {
    const index = this.suppressedPatterns.indexOf(pattern);
    if (index > -1) {
      this.suppressedPatterns.splice(index, 1);
    }
  }
}

// Export singleton instance
export const silentConsole = SilentConsole.getInstance();

// Make available globally
if (typeof window !== 'undefined') {
  (window as any).silentConsole = silentConsole;
  
  // Auto-enable in production
  if (process.env.NODE_ENV === 'production') {
    silentConsole.enable();
  }
}
