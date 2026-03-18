const MAX_CONCURRENT = parseInt(process.env['OLLAMA_CONCURRENCY'] ?? '1', 10);

class LlmQueue {
  private slots = MAX_CONCURRENT;
  private queue: Array<() => void> = [];

  private acquire(): Promise<void> {
    if (this.slots > 0) {
      this.slots--;
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.slots++;
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export const llmQueue = new LlmQueue();
