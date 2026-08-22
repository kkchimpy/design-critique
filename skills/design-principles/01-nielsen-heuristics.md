# 1 — Nielsen's 10 Usability Heuristics

**Use when:** running a general usability sweep on any UI. This is the default
starting framework — broad, fast, applicable to almost every screen.
**Source:** Jakob Nielsen, Nielsen Norman Group.
**Related:** overlaps with Shneiderman ([02](02-shneiderman-golden-rules.md)) on
consistency/control and Tognazzini ([07](07-tognazzini-interaction.md)) on
discoverability. See [INDEX.md](INDEX.md).

## The 10 heuristics

1. **Visibility of system status.** The design keeps users informed about what is
   going on, through timely feedback (loading states, progress, confirmations).
2. **Match between system and the real world.** Speak the users' language with
   familiar words, phrases, and concepts; follow real-world conventions and a
   natural, logical order.
3. **User control and freedom.** Provide a clearly marked "emergency exit" — undo,
   redo, cancel, back — so users can recover from mistakes without dead ends.
4. **Consistency and standards.** Same words, icons, and actions mean the same thing
   everywhere; follow platform and industry conventions (Jakob's Law).
5. **Error prevention.** Eliminate error-prone conditions or surface a confirmation
   before users commit to a risky action. Prevention beats good error messages.
6. **Recognition rather than recall.** Make elements, actions, and options visible.
   Don't force users to remember information from one part of the interface to
   another.
7. **Flexibility and efficiency of use.** Offer accelerators (shortcuts, defaults,
   personalization) that speed up experts without getting in novices' way.
8. **Aesthetic and minimalist design.** Keep content and visuals focused on the
   essentials; every extra unit of information competes with the relevant ones.
9. **Help users recognize, diagnose, and recover from errors.** Error messages in
   plain language: state the problem and constructively suggest a solution.
10. **Help and documentation.** Ideally the UI needs no explanation, but provide
    easy-to-search, task-focused, concise help when needed.

## Evaluation questions

- Does every action give visible feedback within ~1 second?
- Are there clear exits (cancel/undo/back) from every flow and modal?
- Do labels and icons stay consistent across the whole screen and product?
- Are destructive actions guarded by confirmation or undo?
- Is anything the user must remember instead of being shown?
- Are error messages specific, blameless, and paired with a fix?
- Could any element be removed without losing meaning?

## Gotchas

- Don't confuse "aesthetic and minimalist" (#8) with "remove content." It means
  remove *irrelevant* content, not make the screen sparse.
- #5 (prevention) and #9 (recovery) are different stages — credit a design for
  preventing errors *and* separately for recovering from them.
- "Visibility of system status" is the single most violated heuristic; check it on
  every async action (saves, uploads, network calls) even if the happy path looks
  fine.
