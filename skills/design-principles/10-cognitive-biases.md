# 10 — Cognitive Biases in Design

**Use when:** evaluating persuasion, defaults, decision friction, and whether a design
helps or manipulates users into decisions. Also use to check for **dark patterns**.
**Source:** The Decision Lab and behavioral-economics literature.
**Related:** pairs with Fogg ([05](05-fogg-behavior-model.md)) on behavior and Content
heuristics ([09](09-ux-content-heuristics.md)) on honesty. See [INDEX.md](INDEX.md).

## Design-relevant biases

1. **Anchoring.** The first number/option seen biases all later judgments. Pricing
   tables anchor on the highest tier; the first default frames the rest.
2. **Framing effect.** The same information feels different depending on wording
   ("90% fat-free" vs "10% fat"). Frame honestly toward the user's benefit.
3. **Choice overload (Hick's Law).** More options increase decision time and can
   cause paralysis or abandonment. Reduce/curate choices; offer a recommended option.
4. **Decision fatigue.** Decision quality degrades as users make more choices in a
   session; front-load the important decisions and reduce trivial ones.
5. **Default effect.** People tend to stick with pre-selected options. Defaults are
   powerful — they must serve the *user's* interest, not just the business's.
6. **Loss aversion.** Losses loom larger than equivalent gains; users fear losing more
   than they value gaining (use carefully and honestly, e.g., "Don't lose your
   progress").
7. **Social proof.** People look to others' behavior to decide ("12,000 teams use
   this"). Effective and legitimate when truthful.
8. **Scarcity & urgency.** Limited availability raises perceived value. Honest when
   real ("3 left in stock"); a dark pattern when fabricated (fake countdowns).
9. **Von Restorff (isolation) effect.** The item that stands out visually is
   remembered and chosen — use to highlight the *recommended/primary* action.
10. **Peak-end rule.** Users judge an experience by its most intense moment and its
    end, more than the average — design strong endings (confirmations, success
    states).
11. **Confirmation bias / status quo bias.** Users favor what confirms existing
    beliefs and resist change; ease transitions and reassure during change.
12. **Serial position effect.** First and last items in a list are best remembered —
    place the most important options at the ends.

## Evaluation questions

- Do defaults serve the user, or quietly serve the business at the user's expense?
- Is any scarcity/urgency/social-proof claim real, or a manufactured dark pattern?
- Are there so many choices that users may stall (choice overload)? Is there a
  recommended option?
- Does the primary action stand out (Von Restorff) without tricking the user?
- Does the flow end on a satisfying, reassuring note (peak-end)?
- Is any framing misleading the user against their own interest?

## Gotchas

- These biases are dual-use: the same mechanism can *help* users decide or *manipulate*
  them. The ethical test is **whose interest the nudge serves** — flag anything that
  benefits the business at the user's expense as a dark pattern.
- Pre-checked opt-ins, fake countdowns, confirm-shaming ("No, I don't want to save
  money"), and hidden costs are dark patterns — call them out explicitly and rate
  severity high.
- Don't recommend exploiting a bias without noting the ethical line; the council's job
  is honest persuasion, not manipulation.
