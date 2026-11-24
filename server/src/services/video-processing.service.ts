import { z } from "zod";
import { createHash } from "node:crypto";
import { YouTubeSyncStore } from "./youtube-sync.store";

export const transcriptInputSchema = z.object({
  language: z.string().trim().min(2).max(20).default("und"),
  segments: z.array(z.object({
    text: z.string().trim().min(1).max(20_000),
    startSeconds: z.number().finite().nonnegative().nullable().default(null),
    endSeconds: z.number().finite().nonnegative().nullable().default(null),
  }).refine(segment => segment.endSeconds === null ||
    (segment.startSeconds !== null && segment.endSeconds >= segment.startSeconds),
  "End timestamp requires a start timestamp and cannot precede it")).min(1).max(2_000),
}).refine(input => input.segments.reduce((size, segment) => size + segment.text.length, 0) <= 200_000,
"Transcript is too large");

export type TranscriptInput = z.infer<typeof transcriptInputSchema>;

// Adapters must return extracted source statements, never a fabricated transcript.
export const processingResultSchema = z.object({
  provider: z.string().trim().min(1),
  processorVersion: z.string().trim().min(1),
  contentHash: z.string().trim().min(1),
  claims: z.array(z.object({
    text: z.string().trim().min(1),
    context: z.string(),
    startSeconds: z.number().finite().nonnegative().nullable(),
    endSeconds: z.number().finite().nonnegative().nullable(),
  }).refine(claim => claim.endSeconds === null ||
    (claim.startSeconds !== null && claim.endSeconds >= claim.startSeconds),
  "End timestamp requires a start timestamp and cannot precede it")),
});

export type VideoProcessingResult = z.infer<typeof processingResultSchema>;

export interface VideoProcessingAdapter {
  process(input: { videoId: string; sourceKey: string }): Promise<VideoProcessingResult>;
}

/**
 * The first production-safe input adapter. It stores user-supplied transcript
 * segments as source statements without inventing summaries or evidence.
 */
export class TranscriptProcessingAdapter implements VideoProcessingAdapter {
  private readonly transcript: TranscriptInput;

  constructor(input: TranscriptInput) {
    this.transcript = transcriptInputSchema.parse(input);
  }

  async process(): Promise<VideoProcessingResult> {
    const canonical = JSON.stringify({
      language: this.transcript.language.toLowerCase(),
      segments: this.transcript.segments.map(segment => ({
        text: segment.text.replace(/\s+/g, " ").trim(),
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
      })),
    });

    return {
      provider: "user-supplied-transcript",
      processorVersion: "transcript-source-statements-v1",
      contentHash: createHash("sha256").update(canonical).digest("hex"),
      claims: this.transcript.segments.map(segment => ({
        text: segment.text,
        context: `Transcript language: ${this.transcript.language}`,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
      })),
    };
  }
}

export type ProcessingOutcome =
  | { status: "not-found" | "conflict" }
  | { status: "processed" | "unchanged"; attemptId: number; versionId: number; result: VideoProcessingResult }
  | { status: "failed"; attemptId: number; message: string };

export class VideoProcessingService {
  constructor(
    private readonly store: YouTubeSyncStore,
    private readonly adapter: VideoProcessingAdapter,
  ) {}

  async process(videoId: string, sourceKey: string): Promise<ProcessingOutcome> {
    const attempt = await this.store.beginProcessing(videoId, sourceKey);
    if (attempt.status !== "started") return attempt;

    let result: VideoProcessingResult;
    try {
      result = processingResultSchema.parse(await this.adapter.process({ videoId, sourceKey }));
    } catch {
      // Provider errors can contain credentials or transcript content. Persist a safe message.
      const message = "Content processing failed or returned invalid results. Retry after checking the content provider.";
      await this.store.finishProcessing(attempt.attemptId, null, message);
      return { status: "failed", attemptId: attempt.attemptId, message };
    }

    // Storage failures propagate: do not claim success or overwrite the attempt's audit state.
    const completion = await this.store.finishProcessing(attempt.attemptId, result, null);
    if (completion.status === "failed" || completion.versionId === null) {
      throw new Error("A successful processing result did not create or reuse a content version.");
    }
    return { status: completion.status, attemptId: attempt.attemptId, versionId: completion.versionId, result };
  }
}
