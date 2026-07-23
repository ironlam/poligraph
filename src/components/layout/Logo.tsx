import Image from "next/image";

type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  className?: string;
};

export function Logo({ size = 40, withWordmark = false, className }: LogoProps) {
  return (
    <span className={`flex items-center gap-3 ${className ?? ""}`}>
      <span className="relative shrink-0" style={{ width: size, height: size }}>
        <Image
          src="/logo.svg"
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          className="dark:hidden"
          priority
        />
        <Image
          src="/logo-inverse.svg"
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          className="hidden dark:block"
          priority
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
