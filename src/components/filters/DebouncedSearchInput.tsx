"use client";

import { useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DebouncedSearchInputProps {
  /** Current value from URL */
  value: string;
  /** Called with the trimmed value after debounce (or on submit in manual mode) */
  onSearch: (value: string) => void;
  /** Debounce delay in ms (default: 800). Ignored in manual mode. */
  delay?: number;
  /**
   * Manual mode: render a real <form>; onSearch fires only on submit
   * (button click or Enter), never while typing. Default: false (debounced).
   */
  manual?: boolean;
  /** Submit button label in manual mode (default: "Rechercher") */
  submitLabel?: string;
  placeholder?: string;
  className?: string;
  id?: string;
  label?: string;
}

export function DebouncedSearchInput({
  value,
  onSearch,
  delay = 800,
  manual = false,
  submitLabel = "Rechercher",
  placeholder = "Rechercher...",
  className,
  id,
  label,
}: DebouncedSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Sync input with URL on back/forward navigation
  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Debounced mode only: notify after the debounce window. No-op in manual mode
  // so typing never triggers a search.
  const handleChange = (inputValue: string) => {
    if (manual) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(inputValue.trim());
    }, delay);
  };

  // Single submit path shared by Enter (debounced) and the <form> (manual).
  const submit = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSearch(inputRef.current?.value.trim() ?? "");
  };

  // Debounced mode: Enter submits immediately. Manual mode: the native <form>
  // submit handles Enter, so we don't intercept it here.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!manual && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  // Removes the currently applied search. The clear (X) button below only
  // renders when `value` is non-empty (a search is applied), so in manual mode
  // an unsubmitted local entry shows no X and never touches the URL.
  const handleClear = () => {
    if (inputRef.current) inputRef.current.value = "";
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSearch("");
  };

  const field = (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        id={id}
        type="search"
        defaultValue={value}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-8 py-1 text-base md:text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 placeholder:text-muted-foreground"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-1 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
          aria-label="Effacer la recherche"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  if (manual) {
    return (
      <form
        className={cn(className)}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {label && (
          <label htmlFor={id} className="text-xs font-medium text-muted-foreground mb-1 block">
            {label}
          </label>
        )}
        <div className="flex gap-2">
          <div className="flex-1">{field}</div>
          <button
            type="submit"
            className="h-9 shrink-0 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={cn(className)}>
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground mb-1 block">
          {label}
        </label>
      )}
      {field}
    </div>
  );
}
