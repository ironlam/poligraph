"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface CandidateOption {
  slug: string;
  name: string;
  partyShortName: string | null;
}

interface Props {
  currentSlug: string;
  currentName: string;
}

export function CompareToggle({ currentSlug, currentName }: Props) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CandidateOption[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/admin/candidats")
      .then((r) => r.json())
      .then(
        (data: {
          items: Array<{
            politician: { slug: string; fullName: string } | null;
            party: { shortName: string | null } | null;
            candidateName: string;
          }>;
        }) => {
          const list = data.items
            .filter((i) => i.politician && i.politician.slug !== currentSlug)
            .map((i) => ({
              slug: i.politician!.slug,
              name: i.candidateName,
              partyShortName: i.party?.shortName ?? null,
            }));
          setOptions(list);
          setLoaded(true);
        }
      )
      .catch(() => {
        setLoaded(true);
      });
  }, [open, loaded, currentSlug]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="fixed bottom-[calc(var(--tabbar-h)+1rem)] right-4 z-30 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        ⇄ Comparer
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choisir un candidat à comparer"
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Comparer {currentName} avec
            </h2>
            <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
              {!loaded && <li className="text-sm text-slate-500">Chargement…</li>}
              {loaded && options.length === 0 && (
                <li className="text-sm text-slate-500">Aucun autre candidat disponible.</li>
              )}
              {options.map((opt) => (
                <li key={opt.slug}>
                  <Link
                    href={`/admin/candidats/${currentSlug}/comparer/${opt.slug}`}
                    className="block rounded px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {opt.name}
                    {opt.partyShortName && (
                      <span className="ml-2 text-xs text-slate-500">{opt.partyShortName}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-3 w-full rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
