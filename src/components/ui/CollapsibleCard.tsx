"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CollapsibleCardProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * A Card with a toggleable body. Content is always rendered in the DOM
 * (important for SEO) but visually collapsed via max-height + overflow.
 */
export function CollapsibleCard({
  title,
  count,
  defaultOpen = false,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={regionId}
      >
        <div className="flex items-center justify-between">
          <CardTitle>
            {title}
            {count !== undefined && (
              <span className="text-muted-foreground font-normal ml-1">({count})</span>
            )}
          </CardTitle>
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </div>
      </CardHeader>
      {/* Content stays in the DOM (SEO) but is made inert when collapsed so
          keyboard and screen-reader users don't reach visually-hidden links. */}
      <div
        id={regionId}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <CardContent className="pt-0">{children}</CardContent>
        </div>
      </div>
    </Card>
  );
}
