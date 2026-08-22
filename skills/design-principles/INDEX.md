# INDEX — Cross-Reference Map

This map shows how the ten frameworks overlap so you assign each finding **one
primary home** and avoid inflating the issue count by naming the same problem under
several frameworks.

## Frameworks at a glance

| # | Framework | Scope | Granularity |
|---|-----------|-------|-------------|
| 1 | [Nielsen Heuristics](01-nielsen-heuristics.md) | General usability | Medium |
| 2 | [Shneiderman Golden Rules](02-shneiderman-golden-rules.md) | Interaction flow & control | Medium |
| 3 | [Gerhardt-Powals Cognitive](03-gerhardt-powals-cognitive.md) | Cognitive load / data | Medium |
| 4 | [Bastien & Scapin](04-bastien-scapin.md) | Ergonomic detail | Fine |
| 5 | [Fogg Behavior Model](05-fogg-behavior-model.md) | Behavior / conversion | Conceptual |
| 6 | [Gestalt](06-gestalt-grouping.md) | Visual perception | Medium |
| 7 | [Tognazzini](07-tognazzini-interaction.md) | Interaction design | Fine |
| 8 | [WCAG](08-wcag-accessibility.md) | Accessibility | Fine |
| 9 | [Content heuristics](09-ux-content-heuristics.md) | Copy / microcopy | Medium |
| 10 | [Cognitive biases](10-cognitive-biases.md) | Persuasion / ethics | Conceptual |

## Concern → primary framework

When a finding could belong to several frameworks, use the **primary home** column.

| Concern | Primary home | Also touched by |
|---------|--------------|-----------------|
| Consistency of labels/actions | Nielsen #4 (1) | 2, 4 |
| Undo / reversibility / exits | Nielsen #3 (1) | 2 (rules 5–6) |
| System feedback / status | Nielsen #1 (1) | 2 (rule 3), 7 (state) |
| Error prevention | Nielsen #5 (1) | 2 (rule 5), 4 (error mgmt) |
| Error message wording | Content #9 (9) | 1 (#9), 4 |
| Cognitive load / dense data | Gerhardt-Powals (3) | 1 (#8), 6 |
| Grouping / spacing / hierarchy | Gestalt (6) | 3, 4 (grouping) |
| Color as sole signal | WCAG (8) | 7 (color), 3 (#9) |
| Contrast / text legibility | WCAG (8) | 4 (legibility), 7 (readability) |
| Keyboard / focus / screen reader | WCAG (8) | 7 |
| Target size / pointer | Tognazzini Fitts (7) | 8 (target size) |
| Discoverability of actions | Tognazzini (7) | 1 (#6 recognition) |
| Button/link label quality | Content (9) | 1 (#2), 7 (discoverability) |
| Will the user convert/act | Fogg (5) | 10 |
| Defaults / friction reduction | Fogg ability (5) | 10 (default effect) |
| Too many choices | Cognitive biases (10) | 5 (ability) |
| Dark patterns / manipulation | Cognitive biases (10) | 9 (honesty) |
| Tone / voice of copy | Content (9) | 10 |

## Recommended bundles by screen type

- **Marketing / landing page:** Nielsen (1) + Gestalt (6) + Content (9) + Fogg (5) +
  Biases (10).
- **Form / checkout / signup:** Nielsen (1) + Shneiderman (2) + WCAG (8) + Content (9)
  + Fogg (5).
- **Dashboard / admin / analytics:** Gerhardt-Powals (3) + Gestalt (6) + Nielsen (1) +
  WCAG (8).
- **Mobile app screen:** Tognazzini (7, Fitts) + WCAG (8, targets) + Gestalt (6) +
  Nielsen (1).
- **Onboarding / first-run:** Fogg (5) + Nielsen (1) + Content (9) + Tognazzini (7,
  discoverability).
- **Detailed ergonomic audit (any):** add Bastien & Scapin (4) for sub-criterion
  precision.

## De-duplication rule

1. Identify the concern.
2. Look up its **primary home** above.
3. Cite that framework as the finding's source; mention others only as supporting
   context, not as separate issues.

Accessibility (WCAG 8) is the exception — always run it as its own pass even if other
frameworks touch the same element, because accessibility failures are often invisible
to sighted, mouse-using reviewers.
