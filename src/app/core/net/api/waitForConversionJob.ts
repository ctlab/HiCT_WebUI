import type { RequestManager } from "./RequestManager";
import type { ConversionJobResponse } from "./response";

/** Follow the existing conversion service while retaining legacy terminal status names. */
export async function waitForConversionJob(
  requests: RequestManager,
  jobId: string,
  onProgress?: (job: ConversionJobResponse) => void
): Promise<ConversionJobResponse> {
  for (;;) {
    const job = await requests.getConversionJob(jobId);
    onProgress?.(job);
    const status = (job.status ?? "").toLowerCase();
    if (
      ["completed", "complete", "finished", "success", "succeeded"].includes(
        status
      )
    )
      return job;
    if (["failed", "cancelled", "canceled"].includes(status))
      throw new Error(
        job.error || `Conversion job ${jobId} ended with status ${job.status}`
      );
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}
