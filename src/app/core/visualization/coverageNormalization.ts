/*
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and Computer Technologies Laboratory ITMO University team.

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import type {
  CoverageNormalizationStatus,
  RequestManager,
} from "@/app/core/net/api/RequestManager";

/** How one preparation of square-root coverage ended. Nothing is changed unless `ok`. */
export type CoveragePreparation =
  | { ok: true }
  | { ok: false; cancelled: boolean; message: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts the background job that computes square-root coverage and follows it until it ends.
 * `start` false only follows a job that is already running. `shouldStop` lets a caller that went away
 * (a closed sidebar) stop following without cancelling the job.
 */
export async function prepareCoverage(
  requests: Pick<
    RequestManager,
    "prepareCoverageNormalization" | "coverageNormalizationStatus"
  >,
  onProgress: (status: CoverageNormalizationStatus) => void,
  options: { start?: boolean; shouldStop?: () => boolean; pollMs?: number } = {}
): Promise<CoveragePreparation> {
  const pollMs = options.pollMs ?? 500;
  try {
    let current =
      options.start === false
        ? await requests.coverageNormalizationStatus()
        : await requests.prepareCoverageNormalization();
    for (;;) {
      onProgress(current);
      if (current.state === "READY") return { ok: true };
      if (current.state === "FAILED")
        return {
          ok: false,
          cancelled: false,
          message: `Square-root coverage could not be prepared: ${
            current.error ?? "unknown error"
          }. Nothing was changed.`,
        };
      if (current.state === "CANCELLED")
        return { ok: false, cancelled: true, message: "Cancelled." };
      if (options.shouldStop?.())
        return { ok: false, cancelled: true, message: "Stopped waiting." };
      await sleep(pollMs);
      current = await requests.coverageNormalizationStatus();
    }
  } catch (error) {
    console.debug("Coverage preparation failed", error);
    return {
      ok: false,
      cancelled: false,
      message:
        error instanceof Error && error.message
          ? `Square-root coverage could not be prepared: ${error.message}. Nothing was changed.`
          : "Square-root coverage could not be prepared. Nothing was changed.",
    };
  }
}
