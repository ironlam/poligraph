import { ChevronDown } from "lucide-react";

/**
 * Secondary section of the department page: folded on mobile so the commune list comes first,
 * always unfolded from `lg` up. Pure CSS, no client component.
 *
 * From `lg`, in browsers that support `::details-content`, the content is forced visible and the
 * summary is removed (so no "collapsed" state is announced over visible content); a plain heading
 * takes its place. Browsers without that pseudo-element keep a working disclosure at every width:
 * the content is never unreachable.
 */
export function DepartementSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      className="group scroll-mt-20 rounded-2xl border bg-card lg:supports-[selector(::details-content)]:[&::details-content]:[content-visibility:visible]"
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3 marker:hidden lg:supports-[selector(::details-content)]:hidden [&::-webkit-details-marker]:hidden">
        <h2 className="font-display text-lg font-extrabold text-primary">{title}</h2>
        <ChevronDown
          className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className="flex flex-col gap-4 px-5 pb-5 lg:supports-[selector(::details-content)]:pt-5">
        <h2 className="hidden font-display text-xl font-extrabold lg:supports-[selector(::details-content)]:block text-primary">
          {title}
        </h2>
        {children}
      </div>
    </details>
  );
}
