# 3 — Gerhardt-Powals' Cognitive Engineering Principles

**Use when:** the screen is data-dense — dashboards, monitoring tools, admin
consoles, analytics. These principles attack cognitive load directly.
**Source:** Jill Gerhardt-Powals, cognitive engineering research.
**Related:** complements Gestalt ([06](06-gestalt-grouping.md)) for grouping and
Nielsen #8 for minimalism. See [INDEX.md](INDEX.md).

## The 10 principles

1. **Automate unwanted workload.** Let the system do tedious computation and memory
   work; free the user's cognitive resources for higher-level tasks.
2. **Reduce uncertainty.** Display data clearly and unambiguously so users don't have
   to guess or interpret.
3. **Fuse data.** Combine lower-level data into higher-level summaries to reduce
   cognitive load (e.g., a single status indicator over ten raw metrics).
4. **Present new information with meaningful aids to interpretation.** Use familiar
   frameworks, metaphors, and terms so new data is understood quickly.
5. **Use names that are conceptually related to function.** Labels, icons, and
   colors should map to what they actually do.
6. **Group data in consistently meaningful ways** to decrease search time.
7. **Limit data-driven tasks.** Reduce the time spent assimilating raw data; use
   color and graphics to convey meaning at a glance.
8. **Include in the displays only that information needed** by the user at a given
   time.
9. **Provide multiple coding of data** when appropriate (redundant cues — color +
   shape + label — so meaning survives any single channel failing).
10. **Practice judicious redundancy.** Resolve the tension between #8 (minimal) and
    #9 (redundant) by repeating only what aids comprehension.

## Evaluation questions

- Is the user doing math or memory work the system could do for them?
- Are raw numbers shown where a summarized status would suffice?
- Does color/shape carry meaning, or is it decorative?
- Is every element on screen needed *right now* for the current task?
- If color were removed (colorblind user), is meaning still conveyed (#9)?
- Is related data grouped so the eye doesn't hunt across the screen?

## Gotchas

- #8 (only needed info) and #9/#10 (redundancy) seem contradictory — the resolution
  is "redundant *cues* for the same essential data," not "more data."
- Teams over-apply #3 (data fusion) and hide detail users need; check that drill-down
  to the raw data still exists.
- This framework is overkill for simple marketing pages — don't force it; use Nielsen
  + Gestalt instead.
