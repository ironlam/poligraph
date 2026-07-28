"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface ToggleGroupOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  title?: string;
}

export interface ToggleGroupProps {
  label: string;
  value: string;
  options: ToggleGroupOption[];
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Segmented control accessible (radiogroup) : navigation clavier par
 * flèches avec roving tabindex, sélection au clic ou à Espace/Entrée.
 * Réutilisé pour les filtres Chambre / Résultat / Portée / Tri.
 */
export function ToggleGroup({ label, value, options, onChange, className }: ToggleGroupProps) {
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  function focusOptionAt(index: number) {
    const length = options.length;
    const nextIndex = ((index % length) + length) % length;
    buttonRefs.current[nextIndex]?.focus();
    onChange(options[nextIndex]!.value);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusOptionAt(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusOptionAt(index - 1);
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        onChange(options[index]!.value);
        break;
      default:
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex gap-1 rounded-md bg-muted p-1", className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium outline-none transition-colors motion-reduce:transition-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
