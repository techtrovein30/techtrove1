# TechTrove — SIMATS Symposium Website

Full frontend for TechTrove, the multi-day technical and sports symposium by SIMATS.
Dark editorial athletic identity: black and white foundation with purple accents,
Anton display type over Inter body type, wolf emblem as visual anchor.

Built as a client-side React app. All data is mock data; a real backend can be
plugged in later without restructuring.

## Stack

- React 19 + Vite 7 + TypeScript (strict)
- Tailwind CSS v4 (theme tokens in `src/index.css`)
- React Router v7
- lucide-react icons

## Run

```bash
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build
```

## Pages

| Route                 | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `/`                   | Home: hero, marquee, stats, about teaser, day grid |
| `/events`             | Events landing with Day 1 / 2 / 3 selector         |
| `/events/:eventId`    | Event detail (rules, eligibility, register CTA)    |
| `/schedule`           | Timeline per day, coming-soon states               |
| `/rules`              | Rulebook sections                                  |
| `/sponsors`           | Sponsor tier slots                                 |
| `/contact`            | Organizing committee contact                       |
| `/login`              | Internal (registration number) / external accounts |
| `/register`           | Multi-step registration flow                       |
| `/register/success`   | Confirmation + receipt                             |

Registration flow: Sport -> Terms -> Team -> Members -> Review -> Payment.
Player/substitute fields are generated from each sport's configuration.
Terms must be accepted before proceeding; payment is a clearly labelled demo step
that records status `recorded` without any real transaction.

Demo accounts and registrations are stored in `localStorage` only. Clearing
browser data clears them.

## Adding Day 2 / Day 3 events later

Everything event-related lives in one file: `src/data/techtrove.ts`.

1. Set the day's `status` from `"coming-soon"` to `"active"` and update its
   `name` / `description`.
2. Add entries to its `events` array:

```ts
{
  id: "coding-solo",
  dayId: "day-2",
  category: "Technical",
  name: "Event name",
  description: "...",
  image: "/images/your-image.jpg", // optional
  registrationOpen: true,
  registrationType: "individual" | "team",
  requiredPlayers: 2,     // team events only
  maxSubstitutes: 0,
  registrationFee: 300,
  rules: ["..."],
  eligibility: ["..."],
}
```

No page changes are needed. The events grid, detail page, schedule placeholders,
and the registration flow all read from this data. Individual-registration events
reuse the same flow with a single member field.

Schedule content lives in the `schedule` object in the same file; rule sections
in `ruleSections`; sponsor slots in `sponsors`; stats/contact/socials in
`siteConfig`. Placeholder values (Sport 01..06 names, fees, contact details,
stats) are all editable there.

## Swapping the mock backend for a real one

All persistence goes through `src/lib/mockApi.ts` (`api.signIn`, `api.signUp`,
`api.createRegistration`, `api.listMyRegistrations`,
`api.getRegistrationByCode`). Replace the bodies of these functions with real
HTTP calls (Supabase, REST, etc.) and keep the same return shapes:
`User`, `Registration`, `Session` in the same file. UI components never touch
storage directly.

Server-side rules currently enforced in the mock and to be re-enforced on a real
backend: terms accepted, event exists and `registrationOpen`, exact player count,
substitute count within limit, no duplicate member names, one registration per
user per event, fee taken from server-side event config (never the client).

## Images

Current images were pulled from the original site for fidelity. Replace files in
`public/images/` (same filenames) or point the `image` fields in
`src/data/techtrove.ts` at new paths. The wolf logo is used in the navbar, hero,
footer, login panel, coming-soon panels and favicon.
