# 4 — Bastien & Scapin's Ergonomic Criteria

**Use when:** you need a fine-grained ergonomic audit beyond high-level heuristics.
These eight criteria (several with sub-criteria) are precise and good for detailed
inspection reports.
**Source:** J.M. Christian Bastien & Dominique L. Scapin, INRIA.
**Related:** the most granular framework; maps onto Nielsen
([01](01-nielsen-heuristics.md)) but with sharper sub-distinctions. See
[INDEX.md](INDEX.md).

## The 8 criteria

1. **Guidance** — how the interface advises, orients, informs, and leads the user.
   - *Prompting:* cues that tell users what to do and where they are.
   - *Grouping/Distinction of items:* by location and by format/color.
   - *Immediate feedback:* system response to every user action.
   - *Legibility:* visual characteristics that ease reading (size, spacing, contrast).
2. **Workload** — minimize perceptual and cognitive effort.
   - *Brevity:* concise items (*conciseness*) and short action sequences
     (*minimal actions*).
   - *Information density:* the overall amount of information on screen is tuned to
     the task — neither sparse nor overwhelming.
3. **Explicit control** — the system processes only explicitly requested actions
   (*explicit user action*) and gives users control over processing (*user control*).
4. **Adaptability** — the interface's capacity to behave according to context and
   user needs (*flexibility* + accounting for *user experience* level).
5. **Error management** — preventing errors (*error protection*), the quality of
   error messages (*quality of error messages*), and ease of *error correction*.
6. **Consistency** — same design choices in the same contexts, different choices in
   different contexts.
7. **Significance of codes** — labels, symbols, and codes are meaningful and clearly
   related to what they represent.
8. **Compatibility** — match between the system and users' characteristics, tasks,
   and the organization of work; consistency across environments and applications.

## Evaluation questions

- *Prompting:* at every step, is it clear what the user can do next?
- *Legibility:* is text large enough, well spaced, and high-contrast?
- *Information density:* is the screen tuned to the task, not over/under-loaded?
- *Explicit control:* does the system ever act without an explicit request?
- *Significance of codes:* would a new user correctly guess each icon/abbreviation?
- *Compatibility:* does the flow match how users actually do this task offline?

## Gotchas

- This framework's value is its sub-criteria — cite the *specific* sub-criterion
  (e.g., "Guidance → Prompting"), not just the top-level name.
- "Information density" is task-relative: a trading terminal *should* be dense; a
  meditation app should not. Judge against the task, not an absolute.
- It heavily overlaps Nielsen and Shneiderman; reserve it for when you want the
  precision of sub-criteria, otherwise you'll triple-count one issue.
