import { createHash } from "node:crypto";

export function createSubtopicDeltaSourceFingerprint(input: {
  revisionId: string;
  sourceUpdatedAt: string;
  text: string;
  details: string | null;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        revisionId: input.revisionId,
        sourceUpdatedAt: input.sourceUpdatedAt,
        text: input.text,
        details: input.details,
      })
    )
    .digest("hex");
}
