// The fictional business this demo is staged around. Named and described once here so the
// login screen and dashboard stay in sync. Every number it refers to is real seeded/generated
// data (prisma/seed.ts calls the actual classification, automation, and briefing functions),
// not hand-written placeholder text — the company itself is the only fictional part.
export const SCENARIO = {
  company: "Riverside Home Services",
  description:
    "a 3-person HVAC, electrical, and plumbing outfit. Tickets come in by phone, chat, and email; Opsflow triages and prioritizes them, dispatches technicians, and notifies the owner by webhook when a completed job clears $500.",
} as const;
