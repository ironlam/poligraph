import type { Metadata } from "next";

// The page is a client component (it fires an analytics event on mount), so its metadata lives
// here. A subscription confirmation has nothing to offer a search result.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function BienvenueLayout({ children }: { children: React.ReactNode }) {
  return children;
}
