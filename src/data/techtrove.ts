export type RegistrationType = "team" | "individual";

export interface TechEvent {
  id: string;
  dayId: string;
  category: string;
  name: string;
  description: string;
  image?: string;
  registrationOpen: boolean;
  registrationType?: RegistrationType;
  requiredPlayers?: number;
  maxSubstitutes?: number;
  registrationFee?: number;
  rules?: string[];
  eligibility?: string[];
}

export type DayStatus = "active" | "coming-soon";

export interface Day {
  id: string;
  label: string;
  name: string;
  description: string;
  status: DayStatus;
  events: TechEvent[];
}

export interface Stat {
  value: string;
  label: string;
}

export interface ScheduleItem {
  time: string;
  title: string;
  note?: string;
}

export interface RuleSection {
  id: string;
  title: string;
  items: string[];
}

export interface SponsorSlot {
  name?: string;
  logo?: string;
}

export interface SponsorTier {
  tier: string;
  slots: SponsorSlot[];
}

export const siteConfig = {
  name: "TechTrove 3.0",
  presenter: "SIMATS",
  tagline: "Innovate. Compete. Conquer.",
  description:
    "TechTrove 3.0 is the multi-day technical and sports symposium of SIMATS - three days of competition, creativity and collaboration across engineering, design and athletics.",
  eventDate: "Date to be announced",
  venue: "SIMATS Campus, Chennai",
  stats: [
    { value: "1000+", label: "Participants" },
    { value: "25+", label: "Events" },
    { value: "50+", label: "Colleges" },
    { value: "TBA", label: "Prize Pool" },
  ] as Stat[],
  marqueeItems: ["Day 1 Sports", "Day 2 Coming Soon", "Day 3 Coming Soon", "TechTrove 3.0"],
  contact: {
    committee: "TechTrove 3.0 Organizing Committee",
    college: "SIMATS, Chennai",
    email: "techtrove@example.edu",
    phone: "+91 00000 00000",
    venue: "SIMATS Campus, Chennai",
  },
  socials: [
    { label: "Instagram", url: "#" },
    { label: "LinkedIn", url: "#" },
    { label: "YouTube", url: "#" },
  ],
};

const sportsRules: string[] = [
  "Team size must match the published player and substitute limits for the sport.",
  "All players must be enrolled students of the college they represent.",
  "Valid college identification is mandatory at the venue on match day.",
  "Teams must report to the venue at least 30 minutes before their fixture.",
  "The decision of the match officials and organizing committee is final.",
];

const sportsEligibility: string[] = [
  "Open to currently enrolled undergraduate and postgraduate students.",
  "A participant may represent only one college across all Day 1 sports.",
  "External participants must register through the external participant flow.",
];

function sportImage(index: number): string {
  const pool = [
    "/images/sport-a.jpg",
    "/images/sport-c.jpg",
    "/images/sport-b.jpg",
  ];
  return pool[index % pool.length];
}

export const days: Day[] = [
  {
    id: "day-1",
    label: "Day 1",
    name: "Sports",
    description:
      "The symposium opens on the field. Six team sports, one champion college.",
    status: "active",
    events: [0, 1, 2, 3, 4, 5].map((i) => {
      const formats: Array<{
        id: string;
        players: number;
        subs: number;
        fee: number;
      }> = [
        { id: "sport-01", players: 7, subs: 3, fee: 500 },
        { id: "sport-02", players: 5, subs: 2, fee: 500 },
        { id: "sport-03", players: 11, subs: 4, fee: 800 },
        { id: "sport-04", players: 6, subs: 2, fee: 400 },
        { id: "sport-05", players: 4, subs: 1, fee: 300 },
        { id: "sport-06", players: 2, subs: 1, fee: 250 },
      ];
      const f = formats[i];
      return {
        id: f.id,
        dayId: "day-1",
        category: "Sports",
        name: `Sport 0${i + 1}`,
        description:
          "Placeholder event. Replace this description with the final sport details once confirmed.",
        image: sportImage(i),
        registrationOpen: true,
        registrationType: "team",
        requiredPlayers: f.players,
        maxSubstitutes: f.subs,
        registrationFee: f.fee,
        rules: sportsRules,
        eligibility: sportsEligibility,
      } satisfies TechEvent;
    }),
  },
  {
    id: "day-2",
    label: "Day 2",
    name: "Coming soon",
    description: "Events are being finalised. Stay tuned.",
    status: "coming-soon",
    events: [],
  },
  {
    id: "day-3",
    label: "Day 3",
    name: "Coming soon",
    description: "Events are being finalised. Stay tuned.",
    status: "coming-soon",
    events: [],
  },
];

export const allEvents: TechEvent[] = days.flatMap((d) => d.events);

export function getEvent(id: string | undefined): TechEvent | undefined {
  return allEvents.find((e) => e.id === id);
}

export function getDay(id: string): Day | undefined {
  return days.find((d) => d.id === id);
}

export const schedule: Record<string, ScheduleItem[]> = {
  "day-1": [
    { time: "09:00", title: "Registration", note: "On-spot team check-in at the venue desk." },
    { time: "10:00", title: "Opening ceremony", note: "Symposium inauguration." },
    { time: "10:30", title: "Fixtures and group stage", note: "All six sports begin." },
    { time: "13:00", title: "Break", note: "Lunch and recovery window." },
    { time: "14:00", title: "Knockout rounds", note: "Progression fixtures." },
    { time: "17:00", title: "Finals and closing", note: "Finals followed by results." },
  ],
  "day-2": [],
  "day-3": [],
};

export const ruleSections: RuleSection[] = [
  {
    id: "general",
    title: "General symposium rules",
    items: ["To be announced by the organizing committee."],
  },
  {
    id: "registration",
    title: "Registration rules",
    items: [
      "Every team must complete registration through the TechTrove 3.0 portal.",
      "Team captain details are mandatory for each registration.",
      "Player counts must match the limits published for each event.",
      "One registration per team per event.",
    ],
  },
  {
    id: "payment",
    title: "Payment rules",
    items: [
      "The registration fee for each event is shown on its detail page.",
      "Fee once paid is non-refundable.",
      "To be announced: final payment instructions.",
    ],
  },
  {
    id: "sports",
    title: "Sports rules",
    items: sportsRules,
  },
  {
    id: "event-specific",
    title: "Event specific rules",
    items: ["To be announced along with Day 2 and Day 3 events."],
  },
];

export const sponsors: SponsorTier[] = [
  { tier: "Title sponsor", slots: [{}] },
  { tier: "Powered by", slots: [{}] },
  { tier: "Associate", slots: [{}, {}] },
  { tier: "Partner", slots: [{}, {}] },
];
