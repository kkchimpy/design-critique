# 6 — Gestalt Principles of Grouping

**Use when:** evaluating visual layout — how the eye perceives structure, grouping,
and hierarchy. Essential for any screen with multiple elements.
**Source:** Gestalt psychology (Wertheimer, Koffka, Köhler), applied to UI.
**Related:** pairs with Gerhardt-Powals ([03](03-gerhardt-powals-cognitive.md)) on
grouping and WCAG ([08](08-wcag-accessibility.md)) on perceivability. See
[INDEX.md](INDEX.md).

## Core principle

The whole is perceived before its parts. Users see layout structure *before* they
read content, so visual grouping must match logical grouping.

## The principles

1. **Proximity.** Elements close together are perceived as a group. Spacing, not
   borders, is the primary grouping tool — related items near, unrelated items apart.
2. **Similarity.** Elements that share visual traits (color, shape, size, orientation)
   are seen as related. Use it to signal "these things are the same kind."
3. **Closure.** The mind completes incomplete shapes; users perceive a whole even
   when parts are missing (enables minimal icons, implied containers).
4. **Continuity.** The eye follows the smoothest path; elements on a line or curve are
   seen as related and guide the reading order.
5. **Common fate.** Elements moving (or animating) in the same direction are perceived
   as a group — powerful for transitions and selection states.
6. **Figure/ground.** Users separate a focal "figure" from its "ground"; clear
   contrast and depth tell users what is foreground (actionable) vs background.
7. **Common region / enclosure.** Elements within a shared boundary (card, panel) are
   grouped — a stronger cue than proximity alone.
8. **Symmetry & order (Prägnanz / good form).** People prefer simple, ordered,
   balanced arrangements and perceive ambiguous layouts in the simplest way.

## Evaluation questions

- Does whitespace group related items and separate unrelated ones (proximity)?
- Do similar-looking elements actually behave similarly (similarity not misleading)?
- Is there a clear figure/ground — does the primary action stand out from chrome?
- Does the eye follow a deliberate path, or does it wander (continuity)?
- Are cards/regions used consistently to bound logical groups?
- Is the layout balanced, or does visual weight pull attention to the wrong place?

## Gotchas

- The most common violation is **misleading proximity**: a label sitting closer to the
  *wrong* field, or generous padding that splits a group that belongs together.
- Similarity can backfire — if two unrelated things look identical, users assume they
  do the same thing. Differentiate interactive from static elements.
- Borders are overused; try fixing grouping with spacing (proximity) before adding
  lines and boxes, which add visual noise.
