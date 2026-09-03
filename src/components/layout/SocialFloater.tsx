import { Instagram, MessageCircle } from "lucide-react";
import { siteConfig } from "../../data/techtrove";

/**
 * SocialFloater pins quick Instagram + WhatsApp actions to the bottom-right of
 * every public page. Built mobile-first: large touch targets, safe-area aware.
 */
export function SocialFloater() {
  const instagramUrl =
    siteConfig.socials.find((s) => s.label.toLowerCase().includes("insta"))?.url ??
    "https://www.instagram.com/";
  const whatsappUrl =
    siteConfig.socials.find((s) => s.label.toLowerCase().includes("whats"))?.url ??
    "https://wa.me/919677101571";

  const base =
    "group relative flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft";

  return (
    <div
      aria-label="Quick contact"
      className="fixed bottom-4 right-4 z-50 flex flex-col items-center gap-3 md:bottom-6 md:right-6 [padding-bottom:env(safe-area-inset-bottom)]"
    >
      <a
        href={instagramUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Follow TechTrove on Instagram"
        className={`${base} bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] shadow-[0_8px_24px_rgba(220,39,67,0.4)]`}
      >
        <Instagram className="h-5 w-5" aria-hidden />
        <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded border border-edge bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground opacity-0 transition-opacity group-hover:opacity-100">
          Instagram
        </span>
      </a>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with TechTrove on WhatsApp"
        className={`${base} bg-[#25D366] shadow-[0_8px_24px_rgba(37,211,102,0.4)]`}
      >
        <MessageCircle className="h-5 w-5" aria-hidden />
        <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded border border-edge bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground opacity-0 transition-opacity group-hover:opacity-100">
          WhatsApp
        </span>
      </a>
    </div>
  );
}
