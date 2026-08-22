# 9 — UX Content / Microcopy Heuristics

**Use when:** evaluating words — labels, buttons, headings, empty states, error
messages, tone. Copy is interface; bad words break good layouts.
**Source:** UX content design heuristics (Rachel Wood and the broader content-design
field).
**Related:** supports Nielsen #9 ([01](01-nielsen-heuristics.md)) on error messages
and Bastien & Scapin ([04](04-bastien-scapin.md)) on significance of codes. See
[INDEX.md](INDEX.md).

## The 10 heuristics

1. **Useful & purposeful.** Every piece of content earns its place by helping the
   user complete a task or make a decision; remove filler.
2. **Clear & concise.** Plain language, short sentences, no jargon; say the most
   important thing first (front-loading).
3. **Consistent.** Same term for the same concept everywhere; consistent voice,
   capitalization, and terminology (don't call it "folder" then "directory").
4. **Accessible & inclusive.** Readable reading level, no idioms that exclude, no
   bias; works for screen readers and translation.
5. **Findable & scannable.** Structured with meaningful headings, front-loaded key
   words, and chunking so users can scan rather than read.
6. **Actionable.** Buttons and links describe the action/outcome ("Create account"),
   never vague ("Submit", "OK", "Click here").
7. **Contextual & relevant.** Content matches the user's moment, task, and emotional
   state (a billing error needs a different tone than a marketing banner).
8. **Honest & trustworthy.** No dark patterns, no misleading copy; set accurate
   expectations and disclose costs/consequences clearly.
9. **Helpful in errors.** Error messages say what happened, why, and how to fix it —
   in plain, blameless language ("We couldn't find that email" not "Error 422").
10. **On-brand & human.** Voice and tone reflect the brand and sound like a person,
    appropriate to context — confident, not robotic, not flippant in serious moments.

## Evaluation questions

- Does every button/link label state the *outcome* of the action?
- Is the most important information first in each heading and paragraph?
- Is the same concept named the same way throughout?
- Do error messages explain the fix, blamelessly, without codes or jargon?
- Does the empty state teach the user what to do next?
- Is the tone appropriate to the user's emotional context at this moment?

## Gotchas

- "Submit", "OK", "Click here", and bare "Yes/No" on a destructive dialog are classic
  failures of heuristic #6 — the label must name the action.
- Placeholder text is *not* content design — it disappears and isn't a label (see
  WCAG [08](08-wcag-accessibility.md)).
- Tone-deafness is contextual: cheerful microcopy on a payment-failure screen erodes
  trust. Match tone to the moment (#7).
- Empty states and error states are the most under-designed copy surfaces — review
  them specifically, not just the happy path.
