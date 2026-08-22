# 7 — Tognazzini's First Principles of Interaction Design

**Use when:** doing deep interaction-design review — discoverability, efficiency,
pointer targets, state, navigation. Richer and more interaction-focused than Nielsen.
**Source:** Bruce "Tog" Tognazzini.
**Related:** extends Nielsen ([01](01-nielsen-heuristics.md)) and Shneiderman
([02](02-shneiderman-golden-rules.md)). See [INDEX.md](INDEX.md).

## The principles

1. **Aesthetics.** Visual design communicates and persuades; it is not decoration —
   it shapes trust and perceived usability.
2. **Anticipation.** Bring to the user everything needed for the next step; don't make
   them search for information or tools.
3. **Autonomy.** Give users a sense of control within sensible boundaries; keep status
   information visible and current so they can make decisions.
4. **Color.** Never rely on color alone to convey information (colorblind users);
   use it as a redundant cue.
5. **Consistency.** Be consistent where it helps (especially perceived affordances and
   standard controls); be willing to break consistency when it genuinely helps the
   user.
6. **Defaults.** Provide smart, easily replaced defaults; never use "default" as a
   label. Defaults should let users skip work, not trap them.
7. **Discoverability.** Users must be able to discover what actions are possible;
   important functions must be visible, not hidden behind unmarked gestures.
8. **Efficiency of the user.** Optimize for the user's productivity, not the
   computer's. Measure success by user output, not clicks saved on paper.
9. **Explorable interfaces.** Let users explore without penalty; offer clearly marked
   exits and reliable undo so exploration feels safe.
10. **Fitts's Law.** Time to acquire a target is a function of its distance and size.
    Make important targets large and close; screen edges/corners are infinitely deep.
11. **Human-interface objects.** Objects users manipulate should be visible, have
    standard behaviors, and be understandable through consistent metaphors.
12. **Latency reduction.** Mask or reduce wait times; acknowledge input immediately
    even when processing continues in the background.
13. **Learnability.** Balance learnability with usability/efficiency; ideally low
    learning cost with high long-term productivity.
14. **Metaphors.** Use good, memorable metaphors that map to the real world; avoid
    metaphors that constrain or mislead.
15. **Protect users' work.** Never lose the user's work — autosave, protect against
    crashes, connection loss, and accidental destruction.
16. **Readability.** Text must be legible: sufficient contrast, adequate size, and
    real sentence/word structure (especially for older or low-vision users).
17. **Simplicity.** Manage complexity; keep things as simple as possible but no
    simpler — hide advanced complexity until needed (progressive disclosure).
18. **State.** Keep users informed of system state and maintain state across sessions
    (remember where they were, what they selected).
19. **Visible navigation.** Make navigation visible and avoid getting users lost;
    they should always know where they are and how to get back.

## Evaluation questions

- Are the most important targets large and near where the cursor/thumb already is
  (Fitts's Law)? Are edges/corners used for high-value targets?
- Can a first-time user *discover* the key actions without a tutorial?
- Does the design protect the user's work against loss at every step?
- Is color ever the *only* signal for status or meaning?
- Does the screen remember state (selections, scroll, progress) across sessions?
- Is wait time masked with immediate acknowledgment of input?

## Gotchas

- Fitts's Law is routinely violated by tiny icon buttons and targets placed far from
  the user's natural pointer position; flag small tap targets explicitly.
- Discoverability vs. minimalism tension: hiding everything behind hamburger menus and
  unlabeled gestures harms discoverability — call it out.
- "Protect users' work" (#15) is invisible on a static mockup; reason about what
  happens on refresh, back button, or connection loss.
