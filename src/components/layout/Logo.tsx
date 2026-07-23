import Image from "next/image";

type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  className?: string;
  /** Preload the mark. Use only for above-the-fold instances (e.g. the header). */
  priority?: boolean;
};

export function Logo({ size = 40, withWordmark = false, className, priority = false }: LogoProps) {
  return (
    <span className={["flex items-center gap-3", className].filter(Boolean).join(" ")}>
      <span className="shrink-0" style={{ width: size, height: size }}>
        <Image
          src="/logo.svg"
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          className="dark:hidden"
          priority={priority}
        />
        <Image
          src="/logo-inverse.svg"
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          className="hidden dark:block"
          priority={priority}
        />
      </span>
      {withWordmark && (
        <span
          aria-hidden="true"
          className="font-display font-extrabold tracking-[-0.02em] text-primary text-xl"
        >
          Poligraph
        </span>
      )}
    </span>
  );
}
