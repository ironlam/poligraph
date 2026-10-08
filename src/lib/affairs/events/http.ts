import { NextResponse } from "next/server";
import type { EventActionResult } from "./service";

type Failure = Extract<EventActionResult, { ok: false }>;

/** Traduit un échec du service en réponse HTTP. `invalidError` est le titre du 422. */
export function eventFailureResponse(result: Failure, invalidError: string) {
  switch (result.reason) {
    case "not_found":
      return NextResponse.json({ error: "Étape ou affaire introuvable" }, { status: 404 });
    case "not_draft":
      return NextResponse.json({ error: "L'étape n'est plus un brouillon" }, { status: 409 });
    case "not_published":
      return NextResponse.json({ error: "L'étape n'est pas publiée" }, { status: 409 });
    case "not_confirmable":
      return NextResponse.json({ error: "L'étape n'est pas confirmable" }, { status: 409 });
    case "invalid":
      return NextResponse.json(
        { error: invalidError, reasons: result.messages ?? [] },
        { status: 422 }
      );
  }
}
