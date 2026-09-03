import { useState } from "react";
import {
  Mail,
  Phone,
  MapPin,
  MessageCircle,
  Instagram,
  Send,
  ExternalLink,
  Copy,
  Check,
  Users,
} from "lucide-react";
import { siteConfig } from "../data/techtrove";

const channels = [
  {
    index: "01",
    icon: Mail,
    label: "Email",
    hint: "Queries, partnerships and press",
    value: siteConfig.contact.email,
    href: `mailto:${siteConfig.contact.email}`,
    color: "text-primary-soft",
    copyable: true,
  },
  {
    index: "02",
    icon: Phone,
    label: "Phone",
    hint: "Quick help during the symposium",
    value: siteConfig.contact.phone,
    href: `tel:${siteConfig.contact.phone.replace(/\s/g, "")}`,
    color: "text-emerald-400",
    copyable: false,
  },
  {
    index: "03",
    icon: MessageCircle,
    label: "WhatsApp",
    hint: "Fastest replies, day and night",
    value: "Chat with the committee",
    href: "https://wa.me/919677101571",
    color: "text-emerald-400",
    copyable: false,
  },
  {
    index: "04",
    icon: MapPin,
    label: "Venue",
    hint: "SIMATS Campus, Chennai",
    value: siteConfig.contact.venue,
    href: undefined,
    color: "text-primary-soft",
    copyable: false,
  },
];

export function ContactPage() {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(value);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const instagramUrl =
    siteConfig.socials.find((s) => s.label.toLowerCase().includes("insta"))?.url ??
    "https://www.instagram.com/";

  return (
    <div className="reveal-up">
      {/* Hero */}
      <section className="grain relative overflow-hidden border-b border-edge bg-surface/50">
        <span
          aria-hidden
          className="outline-text display pointer-events-none absolute right-0 top-8 select-none whitespace-nowrap text-[clamp(6rem,22vw,16rem)] leading-none"
        >
          Reach
        </span>
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-32 sm:px-6 md:pb-24 md:pt-40 lg:px-8">
          <p className="eyebrow">Contact</p>
          <h1 className="display mt-3 max-w-3xl text-[clamp(2.5rem,8vw,6.5rem)] animated-gradient-text drop-shadow-2xl">
            One arena. Many ways in.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            Questions about events, registration or partnerships. The organizing committee is one
            message away — pick whichever channel suits you.
          </p>
          <hr className="rule-line mt-7 w-44" />
        </div>
      </section>

      {/* Contact channels — a sequence of ways in */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 md:py-20 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          {/* Left rail — the why */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow">Talk to us</p>
            <h2 className="display mt-3 text-4xl text-foreground sm:text-5xl">
              The committee
              <br />
              is listening.
            </h2>
            <hr className="rule-line mt-6 w-40" />
            <p className="mt-6 max-w-md text-sm leading-relaxed text-muted sm:text-base">
              {siteConfig.contact.committee}. We run registration support, answer event questions and
              handle partnerships — all from one inbox.
            </p>

            <div className="mt-10 flex items-start gap-4 glass-panel glowing-border p-6">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary-soft">
                <Users className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <p className="display text-xl text-foreground">{siteConfig.contact.college}</p>
                <p className="mt-1 text-sm text-muted">
                  {siteConfig.eventDate} · {siteConfig.venue}
                </p>
              </div>
            </div>
          </div>

          {/* Right rail — channel sequence */}
          <ol className="space-y-4">
            {channels.map((ch) => (
              <li key={ch.index} className="group">
                <div className="clip-angle relative flex items-center gap-5 border border-edge bg-surface/80 p-6 transition-all hover:border-primary/50 hover:shadow-[0_0_25px_rgba(124,58,237,0.15)] sm:p-7">
                  <span className="display outline-text shrink-0 text-4xl leading-none select-none sm:text-5xl">
                    {ch.index}
                  </span>
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] ${ch.color}`}
                  >
                    <ch.icon className="h-6 w-6" aria-hidden />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="eyebrow block">{ch.label}</span>
                    <span className="mt-1 block break-all text-base font-semibold text-foreground sm:text-lg">
                      {ch.value}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{ch.hint}</span>
                  </span>

                  {ch.copyable && ch.href && (
                    <button
                      type="button"
                      onClick={() => copy(ch.value)}
                      aria-label={`Copy ${ch.label}`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-edge text-muted transition-colors hover:border-primary hover:text-primary-soft"
                    >
                      {copied === ch.value ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  )}

                  {ch.href && !ch.copyable && (
                    <a
                      href={ch.href}
                      target={ch.href.startsWith("http") ? "_blank" : undefined}
                      rel={ch.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      aria-label={`Open ${ch.label}`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-edge text-muted transition-colors hover:border-primary hover:text-primary-soft"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Social CTA band */}
        <div className="diag-stripes relative mt-16 overflow-hidden rounded-2xl border border-edge bg-surface p-8 sm:p-12">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="max-w-md">
              <p className="eyebrow text-primary-soft">Follow the symposium</p>
              <h2 className="display mt-3 text-3xl text-foreground sm:text-4xl">
                Announcements drop here first.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Live updates, spot registration alerts and results land on our channels the moment
                they happen.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center gap-3 rounded-full border border-primary/60 bg-primary/10 px-7 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-primary-soft transition-all hover:bg-primary/20 hover:shadow-[0_0_25px_rgba(124,58,237,0.35)]"
              >
                <Instagram className="h-4 w-4" aria-hidden />
                Instagram
              </a>
              <a
                href="https://wa.me/919677101571"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center gap-3 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-7 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300 transition-all hover:bg-emerald-500/20 hover:shadow-[0_0_25px_rgba(16,185,129,0.35)]"
              >
                <Send className="h-4 w-4" aria-hidden />
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
