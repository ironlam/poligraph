/**
 * Progress Tracker for sync operations
 *
 * Provides visual progress feedback with TTY detection,
 * progress bar, ETA calculation, and statistics.
 */

export interface ProgressOptions {
  total: number;
  label?: string;
  logInterval?: number;
  showBar?: boolean;
  showETA?: boolean;
  barWidth?: number;
}

export interface ProgressStats {
  processed: number;
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
}

/**
 * Progress Tracker class
 */
export class ProgressTracker {
  private total: number;
  private current = 0;
  private label: string;
  private logInterval: number;
  private showBar: boolean;
  private showETA: boolean;
  private barWidth: number;
  private startTime: number;
  private lastLogTime = 0;
  private isTTY: boolean;
  private stats: ProgressStats = { processed: 0 };

  constructor(options: ProgressOptions) {
    this.total = options.total;
    this.label = options.label ?? "Processing";
    this.logInterval = options.logInterval ?? 50;
    this.showBar = options.showBar ?? true;
    this.showETA = options.showETA ?? true;
    this.barWidth = options.barWidth ?? 25;
    this.startTime = Date.now();
    this.isTTY = process.stdout.isTTY === true;
  }

  /**
   * Increment the counter
   */
  tick(count = 1): void {
    this.current += count;
    this.stats.processed = this.current;
    this.maybeLog();
  }

  /**
   * Update with statistics
   */
  update(stats: Partial<ProgressStats>): void {
    Object.assign(this.stats, stats);
    if (stats.processed !== undefined) {
      this.current = stats.processed;
    }
    this.maybeLog();
  }

  /**
   * Set current progress directly
   */
  setCurrent(current: number): void {
    this.current = current;
    this.stats.processed = current;
    this.maybeLog();
  }

  /**
   * Force a log output
   */
  log(message?: string): void {
    if (message) {
      this.clearLine();
      console.log(message);
    } else {
      this.renderProgress();
    }
  }

  /**
   * Finish and show final summary
   */
  finish(): void {
    this.current = this.total;
    this.renderProgress();
    if (this.isTTY) {
      process.stdout.write("\n");
    }
  }

  /**
   * Get elapsed time in seconds
   */
  getElapsedSeconds(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * Get current statistics
   */
  getStats(): ProgressStats {
    return { ...this.stats };
  }

  // --------------------------------------------------------------------------
  // Private methods
  // --------------------------------------------------------------------------

  private maybeLog(): void {
    const now = Date.now();

    // Always log at the start, end, and at intervals
    const shouldLog =
      this.current === 1 ||
      this.current === this.total ||
      this.current % this.logInterval === 0 ||
      now - this.lastLogTime > 5000; // At least every 5 seconds

    if (shouldLog) {
      this.renderProgress();
      this.lastLogTime = now;
    }
  }

  private renderProgress(): void {
    const percent = this.total > 0 ? this.current / this.total : 0;
    const parts: string[] = [];

    // Progress bar
    if (this.showBar) {
      parts.push(this.renderBar(percent));
    }

    // Percentage
    parts.push(`${Math.round(percent * 100)}%`);

    // Count
    parts.push(`${this.current}/${this.total}`);

    // Label
    if (this.label) {
      parts.push(this.label);
    }

    // Stats
    const statsStr = this.renderStats();
    if (statsStr) {
      parts.push(statsStr);
    }

    // ETA
    if (this.showETA && this.current > 0 && this.current < this.total) {
      parts.push(this.renderETA(percent));
    }

    const line = parts.join(" | ");
    this.writeLine(line);
  }

  private renderBar(percent: number): string {
    const filled = Math.round(this.barWidth * percent);
    const empty = this.barWidth - filled;
    return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
  }

  private renderStats(): string {
    const parts: string[] = [];

    if (this.stats.created !== undefined && this.stats.created > 0) {
      parts.push(`+${this.stats.created}`);
    }
    if (this.stats.updated !== undefined && this.stats.updated > 0) {
      parts.push(`~${this.stats.updated}`);
    }
    if (this.stats.skipped !== undefined && this.stats.skipped > 0) {
      parts.push(`-${this.stats.skipped}`);
    }
    if (this.stats.errors !== undefined && this.stats.errors > 0) {
      parts.push(`!${this.stats.errors}`);
    }

    return parts.length > 0 ? parts.join(" ") : "";
  }

  private renderETA(percent: number): string {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const remaining = percent > 0 ? (elapsed / percent) * (1 - percent) : 0;

    if (remaining < 60) {
      return `ETA: ${Math.round(remaining)}s`;
    } else if (remaining < 3600) {
      const minutes = Math.floor(remaining / 60);
      const seconds = Math.round(remaining % 60);
      return `ETA: ${minutes}m${seconds}s`;
    } else {
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.round((remaining % 3600) / 60);
      return `ETA: ${hours}h${minutes}m`;
    }
  }

  private writeLine(line: string): void {
    if (this.isTTY) {
      // Clear and rewrite the line
      process.stdout.write(`\r\x1b[K${line}`);
    } else {
      // Non-TTY: just log
      console.log(line);
    }
  }

  private clearLine(): void {
    if (this.isTTY) {
      process.stdout.write(`\r\x1b[K`);
    }
  }
}
