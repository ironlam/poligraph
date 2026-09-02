import { Mail, Facebook, Globe } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The contact row under a politician's name.
 *
 * Four near-identical anchor blocks in the page component, differing only by icon, label, and how
 * a bare handle becomes a URL. One list, one anchor.
 */

interface PoliticianContactLinksProps {
  fullName: string;
  contactEmail: string | null;
  contactTwitter: string | null;
  contactFacebook: string | null;
  contactWebsite: string | null;
}

interface ContactLink {
  href: string;
  label: string;
  title: string;
  icon: ReactNode;
  external: boolean;
}

function XIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Records hold either a full URL or a bare handle, depending on the import that wrote them. */
function absolute(value: string, prefix: string): string {
  return value.startsWith("http") ? value : `${prefix}${value}`;
}

export function PoliticianContactLinks({
  fullName,
  contactEmail,
  contactTwitter,
  contactFacebook,
  contactWebsite,
}: PoliticianContactLinksProps) {
  const links: ContactLink[] = [];

  if (contactEmail) {
    links.push({
      href: `mailto:${contactEmail}`,
      label: `Envoyer un email à ${fullName}`,
      title: "Email",
      icon: <Mail className="h-4 w-4" />,
      external: false,
    });
  }
  if (contactTwitter) {
    links.push({
      href: absolute(contactTwitter.replace("@", ""), "https://x.com/"),
      label: `Profil X de ${fullName}`,
      title: "X (Twitter)",
      icon: <XIcon />,
      external: true,
    });
  }
  if (contactFacebook) {
    links.push({
      href: absolute(contactFacebook, "https://facebook.com/"),
      label: `Page Facebook de ${fullName}`,
      title: "Facebook",
      icon: <Facebook className="h-4 w-4" />,
      external: true,
    });
  }
  if (contactWebsite) {
    links.push({
      href: absolute(contactWebsite, "https://"),
      label: `Site web de ${fullName}`,
      title: "Site web",
      icon: <Globe className="h-4 w-4" />,
      external: true,
    });
  }

  if (links.length === 0) return null;

  return (
    <div className="flex items-center gap-1 mt-2">
      {links.map((link) => (
        <a
          key={link.title}
          href={link.href}
          aria-label={link.label}
          title={link.title}
          {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          // 44px, the touch target size AGENTS.md requires.
          className="inline-flex items-center justify-center h-11 w-11 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}
