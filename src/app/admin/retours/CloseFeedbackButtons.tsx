"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { closeFeedback } from "./actions";

export function CloseFeedbackButtons({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        className="min-h-11"
        disabled={pending}
        onClick={() => startTransition(() => closeFeedback(id, "DONE"))}
      >
        Marquer traité
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="min-h-11"
        disabled={pending}
        onClick={() => startTransition(() => closeFeedback(id, "REJECTED"))}
      >
        Classer sans suite
      </Button>
    </div>
  );
}
