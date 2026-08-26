import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Info, Lock } from "lucide-react";
import { getAllEvents, getEvent } from "../lib/eventStore";
import type { TechEvent } from "../lib/eventStore";
import { formatFee } from "../lib/utils";
import { api } from "../lib/mockApi";
import { useAuth } from "../context/AuthContext";
import { Field } from "../components/ui/Field";
import { RegistrationStepper, StepShell } from "../components/registration/RegistrationStepper";
import type { StepId } from "../components/registration/RegistrationStepper";

interface Draft {
  eventId: string | null;
  termsAccepted: boolean;
  captainName: string;
  teamName: string;
  players: string[];
  substitutes: string[];
}

const initialDraft: Draft = {
  eventId: null,
  termsAccepted: false,
  captainName: "",
  teamName: "",
  players: [],
  substitutes: [],
};

export function RegisterPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const preselected = getEvent(searchParams.get("event") ?? undefined);

  return (
    <div className="reveal-up mx-auto max-w-4xl px-4 pb-24 pt-28 sm:px-6 md:pt-36 lg:px-8">
      <p className="eyebrow">Registration</p>
      <h1 className="display mt-2 text-4xl text-foreground sm:text-6xl">Team registration</h1>
      <hr className="rule-line mt-5 w-40" />

      <div className="mt-10">
        {user ? (
          <RegistrationFlow preselectedId={preselected?.id ?? null} />
        ) : (
          <LoginFirstPanel eventId={preselected?.id ?? null} />
        )}
      </div>
    </div>
  );
}

function LoginFirstPanel({ eventId }: { eventId: string | null }) {
  return (
    <div className="clip-angle diag-stripes border border-edge bg-surface p-8 text-center sm:p-12">
      <span className="mx-auto flex h-14 w-14 items-center justify-center border border-primary/50 bg-primary/10">
        <Lock className="h-6 w-6 text-primary-soft" aria-hidden />
      </span>
      <h2 className="display mt-6 text-3xl text-foreground">Login first</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
        Registration requires a TechTrove 3.0 account. Sign in with your username, registration
        number or email, or create a new participant account.
      </p>
      <Link
        to={eventId ? `/login?next=${encodeURIComponent(`/register?event=${eventId}`)}` : "/login?next=%2Fregister"}
        className="clip-angle mt-8 inline-flex bg-primary px-8 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft"
      >
        Go to login
      </Link>
    </div>
  );
}

function RegistrationFlow({ preselectedId }: { preselectedId: string | null }) {
  const navigate = useNavigate();

  const [step, setStep] = useState<StepId>(preselectedId ? "terms" : "sport");
  const [draft, setDraft] = useState<Draft>(() => {
    if (!preselectedId) return initialDraft;
    const ev = getEvent(preselectedId);
    if (!ev || !ev.registrationOpen) return initialDraft;
    return {
      ...initialDraft,
      eventId: ev.id,
      players: Array.from({ length: ev.requiredPlayers ?? 1 }, () => ""),
      substitutes: Array.from({ length: ev.maxSubstitutes ?? 0 }, () => ""),
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const event = draft.eventId ? getEvent(draft.eventId) : undefined;

  function selectEvent(ev: TechEvent) {
    setDraft((d) => ({
      ...d,
      eventId: ev.id,
      players: Array.from({ length: ev.requiredPlayers ?? 1 }, (_, i) => d.players[i] ?? ""),
      substitutes: Array.from({ length: ev.maxSubstitutes ?? 0 }, (_, i) => d.substitutes[i] ?? ""),
    }));
    setErrors({});
  }

  function goNext() {
    const i = STEP_IDS.indexOf(step);
    setStep(STEP_IDS[Math.min(i + 1, STEP_IDS.length - 1)]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    const i = STEP_IDS.indexOf(step);
    setStep(STEP_IDS[Math.max(i - 1, 0)]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handlePayment(): Promise<void> {
    if (!event) throw new Error("Select a sport first.");
    const registration = await api.createRegistration({
      eventId: event.id,
      teamName: draft.teamName,
      captainName: draft.captainName,
      players: draft.players,
      substitutes: draft.substitutes,
      termsAccepted: draft.termsAccepted,
    });
    navigate(`/register/success?code=${encodeURIComponent(registration.registrationCode)}`);
  }

  const stepBody = useMemo(() => {
    switch (step) {
      case "sport":
        return (
          <SportStep
            selectedId={draft.eventId}
            onSelect={(ev) => selectEvent(ev)}
          />
        );
      case "terms":
        return event && (
          <TermsStep
            event={event}
            accepted={draft.termsAccepted}
            onAccept={(v) => setDraft((d) => ({ ...d, termsAccepted: v }))}
          />
        );
      case "team":
        return (
          <TeamStep
            event={event}
            draft={draft}
            errors={errors}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          />
        );
      case "members":
        return (
          <MembersStep
            event={event}
            draft={draft}
            errors={errors}
            onChangePlayers={(players) => setDraft((d) => ({ ...d, players }))}
            onChangeSubstitutes={(substitutes) => setDraft((d) => ({ ...d, substitutes }))}
          />
        );
      case "review":
        return event && <ReviewStep event={event} draft={draft} />;
      case "payment":
        return event && <PaymentStep event={event} draft={draft} onPay={handlePayment} />;
    }
  }, [step, draft, errors, event]);

  // Step-level validation before advancing.
  function validateAndNext(): void {
    const nextErrors: Record<string, string> = {};

    if (step === "sport") {
      if (!draft.eventId) nextErrors.step = "Select a sport to continue.";
    }

    if (step === "terms") {
      if (!draft.termsAccepted) nextErrors.step = "You must accept the Terms and Conditions.";
    }

    if (step === "team") {
      if (!draft.teamName.trim()) nextErrors.teamName = "Team name is required.";
      if (!draft.captainName.trim()) nextErrors.captainName = "Captain name is required.";
    }

    if (step === "members" && event) {
      const required = event.requiredPlayers ?? 0;
      draft.players.forEach((p, i) => {
        if (!p.trim()) nextErrors[`player-${i}`] = `Player ${String(i + 1).padStart(2, "0")} name is required.`;
      });
      const all = [...draft.players, ...draft.substitutes].map((n) => n.trim().toLowerCase()).filter(Boolean);
      if (all.length < required) nextErrors.step = "Fill in every required player.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) goNext();
  }

  const isFirst = step === "sport";
  const isLast = step === "payment";
  const nextLabel =
    step === "terms" ? "Proceed" : step === "review" ? "Proceed to payment" : step === "sport" ? "Continue" : "Continue";

  return (
    <>
      <RegistrationStepper current={step} />

      <div key={step} className="reveal-up mt-8 space-y-6">
        {stepBody}

        {"step" in errors && errors.step && (
          <p role="alert" className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
            {errors.step}
          </p>
        )}

        {!isLast && (
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={goBack}
              disabled={isFirst}
              className="clip-angle inline-flex items-center justify-center gap-2 border border-edge-strong px-7 py-4 text-xs font-semibold uppercase tracking-[0.18em] transition-colors hover:border-primary hover:text-primary-soft disabled:pointer-events-none disabled:opacity-30"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </button>
            <button
              type="button"
              onClick={validateAndNext}
              className="clip-angle inline-flex items-center justify-center gap-2 bg-primary px-9 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft"
            >
              {nextLabel} <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

const STEP_IDS: StepId[] = ["sport", "terms", "team", "members", "review", "payment"];

/* ------------------------------ Steps ------------------------------ */

function SportStep({ selectedId, onSelect }: { selectedId: string | null; onSelect: (ev: TechEvent) => void }) {
  const openEvents = getAllEvents().filter((e) => e.registrationOpen);

  return (
    <StepShell title="Select your sport" lead="Pick the Day 1 sport your team is entering. You can register additional teams separately.">
      {openEvents.length === 0 ? (
        <p className="text-sm text-muted">No events are open for registration right now.</p>
      ) : (
        <div role="radiogroup" aria-label="Available sports" className="grid gap-3 sm:grid-cols-2">
          {openEvents.map((ev) => {
            const active = ev.id === selectedId;
            return (
              <button
                key={ev.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelect(ev)}
                className={
                  "flex items-center gap-4 border p-4 text-left transition-colors " +
                  (active
                    ? "border-primary bg-primary/10"
                    : "border-edge bg-background hover:border-primary/50")
                }
              >
                <span
                  aria-hidden
                  className={
                    "flex h-10 w-10 shrink-0 items-center justify-center border text-xs font-bold " +
                    (active ? "border-primary bg-primary text-white" : "border-edge-strong text-muted")
                  }
                >
                  {ev.id.replace(/^sport-/, "")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="display block text-lg text-foreground">{ev.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {ev.requiredPlayers} players · {ev.maxSubstitutes} substitutes · {formatFee(ev.registrationFee)}
                  </span>
                </span>
                {active && <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-soft">Selected</span>}
              </button>
            );
          })}
        </div>
      )}
    </StepShell>
  );
}

function TermsStep({
  event,
  accepted,
  onAccept,
}: {
  event: TechEvent;
  accepted: boolean;
  onAccept: (v: boolean) => void;
}) {
  return (
    <StepShell
      title={`Terms and conditions`}
      lead={`Read the rules for ${event.name}. By proceeding you accept these terms on behalf of your team.`}
    >
      <ol className="divide-y divide-edge border-y border-edge">
        {(event.rules ?? []).map((rule, i) => (
          <li key={i} className="flex gap-4 py-3.5">
            <span aria-hidden className="display shrink-0 text-base text-primary-soft/80">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="pt-px text-sm leading-relaxed text-muted">{rule}</span>
          </li>
        ))}
      </ol>

      <label className="mt-7 flex cursor-pointer items-start gap-3 border border-edge-strong bg-background p-4">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAccept(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#7c3aed]"
        />
        <span className="text-sm leading-relaxed text-foreground">
          I agree to the Terms and Conditions, including that the registration fee of{" "}
          <strong className="font-semibold">{formatFee(event.registrationFee)}</strong> is
          non-refundable.
        </span>
      </label>
    </StepShell>
  );
}

function TeamStep({
  event,
  draft,
  errors,
  onChange,
}: {
  event?: TechEvent;
  draft: Draft;
  errors: Record<string, string>;
  onChange: (patch: Partial<Draft>) => void;
}) {
  return (
    <StepShell title="Team details" lead="Name your team and confirm the captain. The game is locked to your selected sport.">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Team captain name"
          required
          value={draft.captainName}
          onChange={(e) => onChange({ captainName: e.target.value })}
          error={errors.captainName}
          autoComplete="name"
        />
        <Field
          label="Team name"
          required
          value={draft.teamName}
          onChange={(e) => onChange({ teamName: e.target.value })}
          error={errors.teamName}
        />
        <div className="sm:col-span-2">
          <Field
            label="Game / Sport"
            value={event?.name ?? ""}
            readOnly
            hint="Locked to your selected event."
            className="cursor-not-allowed text-muted"
          />
        </div>
      </div>
    </StepShell>
  );
}

function MembersStep({
  event,
  draft,
  errors,
  onChangePlayers,
  onChangeSubstitutes,
}: {
  event?: TechEvent;
  draft: Draft;
  errors: Record<string, string>;
  onChangePlayers: (players: string[]) => void;
  onChangeSubstitutes: (subs: string[]) => void;
}) {
  const required = event?.requiredPlayers ?? 0;
  const maxSubs = event?.maxSubstitutes ?? 0;

  return (
    <StepShell
      title="Team members"
      lead={`${required} players are mandatory${maxSubs > 0 ? `, plus up to ${maxSubs} optional substitutes` : ""} for ${event?.name ?? "this event"}.`}
    >
      <fieldset>
        <legend className="eyebrow mb-4">Players · required</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: required }).map((_, i) => (
            <Field
              key={i}
              label={`Player ${String(i + 1).padStart(2, "0")}`}
              required
              value={draft.players[i] ?? ""}
              onChange={(e) => {
                const players = [...draft.players];
                players[i] = e.target.value;
                onChangePlayers(players);
              }}
              error={errors[`player-${i}`]}
            />
          ))}
        </div>
      </fieldset>

      {maxSubs > 0 && (
        <fieldset className="mt-9">
          <legend className="eyebrow mb-4">Substitutes · optional</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: maxSubs }).map((_, i) => (
              <Field
                key={i}
                label={`Substitute ${String(i + 1).padStart(2, "0")}`}
                value={draft.substitutes[i] ?? ""}
                onChange={(e) => {
                  const subs = [...draft.substitutes];
                  subs[i] = e.target.value;
                  onChangeSubstitutes(subs);
                }}
              />
            ))}
          </div>
        </fieldset>
      )}
    </StepShell>
  );
}

function ReviewRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-edge py-3.5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{term}</dt>
      <dd className="min-w-0 text-sm text-foreground sm:text-right">{children}</dd>
    </div>
  );
}

function ReviewStep({ event, draft }: { event: TechEvent; draft: Draft }) {
  const filledSubs = draft.substitutes.filter((s) => s.trim());

  return (
    <StepShell title="Review your entry" lead="Check everything carefully. Changes after payment cannot be made.">
      <dl>
        <ReviewRow term="Sport">{event.name}</ReviewRow>
        <ReviewRow term="Category">{event.category}</ReviewRow>
        <ReviewRow term="Team name">{draft.teamName}</ReviewRow>
        <ReviewRow term="Captain">{draft.captainName}</ReviewRow>
        <ReviewRow term="Players">
          <span className="block whitespace-pre-line text-left sm:inline">
            {draft.players.filter(Boolean).join(", ")}
          </span>
        </ReviewRow>
        <ReviewRow term="Substitutes">{filledSubs.length > 0 ? filledSubs.join(", ") : "None"}</ReviewRow>
        <ReviewRow term="Registration fee">{formatFee(event.registrationFee)}</ReviewRow>
        <ReviewRow term="Terms accepted">{draft.termsAccepted ? "Yes" : "No"}</ReviewRow>
      </dl>

      <p className="mt-6 text-xs text-muted">
        Something wrong? Use Back to revisit earlier steps and correct your details.
      </p>
    </StepShell>
  );
}

function PaymentStep({
  event,
  draft,
  onPay,
}: {
  event: TechEvent;
  draft: Draft;
  onPay: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      await onPay();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be recorded. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepShell title="Payment" lead="Complete the registration fee to confirm your slot.">
      <div className="border border-edge-strong bg-background p-6">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{event.name} · registration fee</dt>
            <dd>{formatFee(event.registrationFee)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Team</dt>
            <dd>{draft.teamName}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-edge pt-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.16em]">Amount payable</dt>
            <dd className="display text-2xl text-primary-soft">{formatFee(event.registrationFee)}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-5 flex items-start gap-2 border border-edge bg-elevated px-4 py-3 text-xs leading-relaxed text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-soft" aria-hidden />
        Demo checkout: no real money moves and no card details are collected. A real payment
        gateway will be connected later; your registration is confirmed instantly in this demo.
      </p>

      {error && (
        <p role="alert" className="mt-5 border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="clip-angle mt-7 flex w-full items-center justify-center gap-2 bg-primary px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft disabled:opacity-50"
      >
        {busy ? "Processing" : `Pay ${formatFee(event.registrationFee)} (demo)`}
      </button>
    </StepShell>
  );
}
