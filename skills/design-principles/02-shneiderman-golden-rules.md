# 2 — Shneiderman's 8 Golden Rules of Interface Design

**Use when:** evaluating interaction flow, consistency, and how much control the user
feels. Strong for transactional UIs, forms, and multi-step tasks.
**Source:** Ben Shneiderman, *Designing the User Interface*.
**Related:** heavy overlap with Nielsen ([01](01-nielsen-heuristics.md)). Use
Shneiderman when the concern is *interaction sequencing and user agency*. See
[INDEX.md](INDEX.md).

## The 8 golden rules

1. **Strive for consistency.** Identical sequences of actions in similar situations;
   consistent terminology in prompts, menus, and help.
2. **Enable frequent users to use shortcuts.** As usage grows, users want to reduce
   interactions — abbreviations, function keys, hidden commands, macros.
3. **Offer informative feedback.** For every action, give feedback proportional to
   the action's significance (modest for frequent/minor, substantial for major).
4. **Design dialogs to yield closure.** Group action sequences into beginning,
   middle, and end; a completion message gives satisfaction and a signal to move on.
5. **Offer simple error handling.** Design so users can't make serious errors; if one
   occurs, detect it and offer a simple, comprehensible recovery.
6. **Permit easy reversal of actions.** Reversibility relieves anxiety and encourages
   exploration because users know mistakes can be undone.
7. **Support internal locus of control.** Users should feel they are in charge — the
   interface responds to them, not surprises them with unrequested actions.
8. **Reduce short-term memory load.** Keep displays simple; humans hold roughly 7±2
   chunks. Consolidate, and avoid forcing users to remember across screens.

## Evaluation questions

- Is the same action triggered the same way everywhere in the flow?
- Can power users move faster (keyboard, defaults, bulk actions)?
- Does the user get a clear "you're done" moment at the end of each task?
- Is every committed action reversible, or at least confirmable?
- Does anything happen *to* the user without their initiation (auto-redirects,
  surprise modals, content shifting under the cursor)?
- How many items must the user hold in their head to finish the task?

## Gotchas

- Rule 7 (locus of control) is subtle: auto-advancing carousels, forced tours, and
  surprise pop-ups all violate it even when "helpful."
- "Closure" (rule 4) is frequently missing in single-page apps — a saved form that
  silently resets gives no sense of completion.
- Don't double-count consistency with Nielsen #4; pick one as the primary home for
  a given finding.
