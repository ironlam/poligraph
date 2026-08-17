/**
 * Checkpoint Manager for sync script recovery
 *
 * Allows long-running sync scripts to save progress and resume
 * from where they left off after a failure or interruption.
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParseOrThrow } from "@/lib/api/safe-json";

const CHECKPOINT_DIR = "/tmp/poligraph-checkpoints";

export interface Checkpoint {
  source: string;
  runId: string;
  startedAt: Date;
  lastProcessedAt: Date;
  processedCount: number;
  lastProcessedId?: string;
  lastProcessedIndex?: number;
  metadata?: Record<string, unknown>;
}

export interface CheckpointManagerOptions {
  /** Auto-save interval in items processed (default: 100) */
  autoSaveInterval?: number;
  /** Max age of checkpoint before it's considered stale (default: 24h) */
  maxAgeMs?: number;
}

/**
 * Checkpoint Manager class
 */
export class CheckpointManager {
  private source: string;
  private runId: string;
  private checkpoint: Checkpoint | null = null;
  private autoSaveInterval: number;
  private maxAgeMs: number;
  private itemsSinceLastSave = 0;

  constructor(source: string, options: CheckpointManagerOptions = {}) {
    this.source = source;
    this.runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.autoSaveInterval = options.autoSaveInterval ?? 100;
    this.maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000; // 24 hours

    // Ensure checkpoint directory exists
    if (!fs.existsSync(CHECKPOINT_DIR)) {
      fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
    }
  }

  /**
   * Get the checkpoint file path for this source
   */
  private getFilePath(): string {
    return path.join(CHECKPOINT_DIR, `${this.source}.json`);
  }

  /**
   * Start a new sync run
   */
  start(): string {
    this.checkpoint = {
      source: this.source,
      runId: this.runId,
      startedAt: new Date(),
      lastProcessedAt: new Date(),
      processedCount: 0,
    };
    this.save();
    return this.runId;
  }

  /**
   * Save the current checkpoint
   */
  save(data: Partial<Omit<Checkpoint, "source" | "runId" | "startedAt">> = {}): void {
    if (!this.checkpoint) return;

    this.checkpoint = {
      ...this.checkpoint,
      ...data,
      lastProcessedAt: new Date(),
    };

    try {
      fs.writeFileSync(this.getFilePath(), JSON.stringify(this.checkpoint, null, 2));
    } catch (error) {
      console.error(`Failed to save checkpoint: ${error}`);
    }

    this.itemsSinceLastSave = 0;
  }

  /**
   * Update progress (auto-saves at intervals)
   */
  tick(lastProcessedId?: string, lastProcessedIndex?: number): void {
    if (!this.checkpoint) return;

    this.checkpoint.processedCount++;
    this.checkpoint.lastProcessedAt = new Date();

    if (lastProcessedId !== undefined) {
      this.checkpoint.lastProcessedId = lastProcessedId;
    }
    if (lastProcessedIndex !== undefined) {
      this.checkpoint.lastProcessedIndex = lastProcessedIndex;
    }

    this.itemsSinceLastSave++;

    // Auto-save at intervals
    if (this.itemsSinceLastSave >= this.autoSaveInterval) {
      this.save();
    }
  }

  /**
   * Get the last checkpoint for this source
   */
  getLastCheckpoint(): Checkpoint | null {
    try {
      const filePath = this.getFilePath();
      if (!fs.existsSync(filePath)) return null;

      const content = fs.readFileSync(filePath, "utf-8");
      const checkpoint = safeJsonParseOrThrow<Checkpoint>(content);

      // Convert date strings to Date objects
      checkpoint.startedAt = new Date(checkpoint.startedAt);
      checkpoint.lastProcessedAt = new Date(checkpoint.lastProcessedAt);

      return checkpoint;
    } catch {
      return null;
    }
  }

  /**
   * Check if we can resume from a previous run
   */
  canResume(): boolean {
    const last = this.getLastCheckpoint();
    if (!last) return false;

    // Check if checkpoint is too old
    const age = Date.now() - last.lastProcessedAt.getTime();
    if (age > this.maxAgeMs) {
      console.log(
        `Checkpoint is stale (${Math.round(age / 1000 / 60)} minutes old), starting fresh`
      );
      return false;
    }

    return last.processedCount > 0;
  }

  /**
   * Resume from the last checkpoint
   * Returns the starting index/ID to resume from
   */
  resume(): { fromIndex?: number; fromId?: string; processedCount: number } | null {
    const last = this.getLastCheckpoint();
    if (!last || !this.canResume()) return null;

    console.log(`Resuming from checkpoint: ${last.processedCount} items already processed`);
    console.log(`Last processed at: ${last.lastProcessedAt.toISOString()}`);

    // Continue with a new run ID but keep the progress
    this.checkpoint = {
      ...last,
      runId: this.runId,
      startedAt: new Date(),
    };

    return {
      fromIndex: last.lastProcessedIndex,
      fromId: last.lastProcessedId,
      processedCount: last.processedCount,
    };
  }

  /**
   * Mark the sync as complete (removes checkpoint)
   */
  complete(): void {
    try {
      const filePath = this.getFilePath();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Failed to remove checkpoint: ${error}`);
    }
    this.checkpoint = null;
  }

  /**
   * Get current progress
   */
  getProgress(): { processedCount: number; lastProcessedId?: string } | null {
    if (!this.checkpoint) return null;
    return {
      processedCount: this.checkpoint.processedCount,
      lastProcessedId: this.checkpoint.lastProcessedId,
    };
  }

  /**
   * Clean up old checkpoints (older than maxAge)
   */
  static cleanup(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
    if (!fs.existsSync(CHECKPOINT_DIR)) return 0;

    let cleaned = 0;
    const now = Date.now();

    const files = fs.readdirSync(CHECKPOINT_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const filePath = path.join(CHECKPOINT_DIR, file);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const checkpoint = safeJsonParseOrThrow<Checkpoint>(content);
        const lastProcessed = new Date(checkpoint.lastProcessedAt).getTime();

        if (now - lastProcessed > maxAgeMs) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch {
        // Invalid checkpoint file, remove it
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * Create a checkpoint manager for a sync source
 */
export function createCheckpoint(
  source: string,
  options?: CheckpointManagerOptions
): CheckpointManager {
  return new CheckpointManager(source, options);
}
