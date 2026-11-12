/** Deferred result delivery belongs to the open viewer, not a dismissed dialog. */
export class BackgroundResultDelivery {
  private readonly pending = new Map<
    string,
    { current: () => boolean; deliver: () => Promise<void> }
  >();
  private processing = false;
  defer(
    id: string,
    current: () => boolean,
    deliver: () => Promise<void>
  ): void {
    this.pending.set(id, { current, deliver });
  }
  async process(jobs: readonly { id: string; state: string }[]): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      for (const [id, intent] of this.pending) {
        if (!intent.current()) {
          this.pending.delete(id);
          continue;
        }
        const job = jobs.find((item) => item.id === id);
        if (!job || ["submitted", "running", "preparing"].includes(job.state))
          continue;
        this.pending.delete(id); // claim before awaiting, so concurrent refreshes cannot duplicate delivery
        if (job.state === "finished") {
          try {
            await intent.deliver();
          } catch {
            /* The delivery action reports its failure; Jobs retains the result for manual retry. */
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }
}
