# Design Principles Skill Library

**Description:** Use this library when critiquing a visual design, UI screen, mockup,
wireframe, Figma export, or screenshot. It bundles ten established design and
behavioral-science frameworks into reusable evaluation guides. Each council persona
should view the uploaded image through these lenses to produce structured,
defensible design feedback rather than vague opinions.

## When to use this

Load this library when an image is attached to a question. Do **not** use it for
plain text Q&A — it is design-critique-only.

Triggers: "review this screen", "critique this UI", "what's wrong with this layout",
"is this usable", "design feedback", "heuristic evaluation", any attached mockup.

## The ten frameworks

| # | File | Best for |
|---|------|----------|
| 1 | [01-nielsen-heuristics.md](01-nielsen-heuristics.md) | General usability sweep — the default starting point |
| 2 | [02-shneiderman-golden-rules.md](02-shneiderman-golden-rules.md) | Interaction flow, consistency, control |
| 3 | [03-gerhardt-powals-cognitive.md](03-gerhardt-powals-cognitive.md) | Data-dense screens, dashboards, cognitive load |
| 4 | [04-bastien-scapin.md](04-bastien-scapin.md) | Fine-grained ergonomic audit |
| 5 | [05-fogg-behavior-model.md](05-fogg-behavior-model.md) | Conversion, onboarding, "will the user act?" |
| 6 | [06-gestalt-grouping.md](06-gestalt-grouping.md) | Visual layout, grouping, hierarchy |
| 7 | [07-tognazzini-interaction.md](07-tognazzini-interaction.md) | Deep interaction design, discoverability, Fitts's Law |
| 8 | [08-wcag-accessibility.md](08-wcag-accessibility.md) | Accessibility, contrast, keyboard, screen readers |
| 9 | [09-ux-content-heuristics.md](09-ux-content-heuristics.md) | Microcopy, labels, error messages, tone |
| 10 | [10-cognitive-biases.md](10-cognitive-biases.md) | Persuasion, defaults, decision friction |

See [INDEX.md](INDEX.md) for how these frameworks overlap so you don't double-count
the same issue under two names.

## How to run a critique

1. **Describe what you see.** Name the screen type, the primary user goal, and the
   key elements. Grounding the critique in the actual image prevents generic advice.
2. **Pick 2–4 frameworks** that fit the screen (use the table above). A simple
   landing page needs Nielsen + Gestalt + Content; a dense admin dashboard needs
   Gerhardt-Powals + Nielsen + WCAG.
3. **Walk the principles.** For each chosen framework, go through its principles and
   its "Evaluation questions" section against the image.
4. **Record findings** with: principle name, what's wrong, where on the screen, and
   a concrete fix.
5. **Rate severity** (see below).
6. **Watch the gotchas.** Each file has a Gotchas section listing what reviewers
   commonly get wrong — read it before finalizing.

## Severity scale

Rate every finding so the team can prioritize:

- **0 — Not a problem** / cosmetic preference only.
- **1 — Cosmetic:** fix if time permits.
- **2 — Minor:** low priority; small friction.
- **3 — Major:** important to fix; users will struggle.
- **4 — Catastrophic:** blocks the user or breaks trust; fix before ship.

## Combining frameworks

Comprehensive reviews layer frameworks by concern:

- **Can they perceive it?** → Gestalt (6), WCAG (8)
- **Can they understand it?** → Nielsen (1), Content (9), Gerhardt-Powals (3)
- **Can they operate it?** → Shneiderman (2), Tognazzini (7)
- **Will they act?** → Fogg (5), Cognitive biases (10)
- **Fine ergonomic detail?** → Bastien & Scapin (4)

Map each finding to exactly one framework as its primary home (use INDEX.md to
decide) to avoid inflating the issue count with duplicates.
