# 8 — WCAG Accessibility Principles (POUR)

**Use when:** auditing accessibility — contrast, keyboard use, screen-reader support,
text alternatives. Run this on *every* serious critique; accessibility is not
optional.
**Source:** W3C Web Content Accessibility Guidelines 2.x.
**Related:** reinforces Gestalt ([06](06-gestalt-grouping.md)) on perception and
Tognazzini ([07](07-tognazzini-interaction.md)) on color/readability. See
[INDEX.md](INDEX.md).

## The four principles (POUR)

Content must be **P**erceivable, **O**perable, **U**nderstandable, and **R**obust.

1. **Perceivable** — information and UI must be presentable in ways users can
   perceive.
   - Text alternatives for non-text content (alt text).
   - Captions/alternatives for media.
   - Content adaptable and distinguishable: don't rely on color alone; sufficient
     **contrast** (≥ 4.5:1 for normal text, ≥ 3:1 for large text and UI components).
   - Text resizable to 200% without loss of content/function.
2. **Operable** — UI components and navigation must be operable.
   - All functionality available from a **keyboard**; no keyboard traps.
   - Enough time; avoid content that flashes more than 3×/sec (seizure safety).
   - Navigable: clear page titles, focus order, **visible focus indicator**, and
     descriptive link text.
   - Target size adequate for touch (≥ 24×24 CSS px minimum, 44×44 recommended).
3. **Understandable** — information and operation must be understandable.
   - Readable language; predictable behavior (no surprise context changes on focus
     or input).
   - Input assistance: labels/instructions, error identification, and suggestions.
4. **Robust** — content works across user agents and assistive technologies.
   - Valid, well-structured markup; correct name/role/value for custom components
     (ARIA where needed); status messages announced to screen readers.

## Evaluation questions

- Does text meet 4.5:1 contrast (3:1 for large text and UI controls)?
- Is meaning ever carried by color alone (e.g., red = error with no icon/label)?
- Can every interactive element be reached and operated by keyboard, with a visible
  focus state?
- Do form fields have persistent, programmatically associated labels (not just
  placeholders)?
- Are touch targets large enough and adequately spaced?
- Do images/icons that carry meaning have text alternatives?

## Gotchas

- **Placeholder-as-label** is a top offender: placeholders vanish on input and often
  fail contrast — always require a real label.
- Contrast must be checked on the *actual* foreground/background pair, including text
  over images and disabled-state text.
- A static mockup hides keyboard/focus and screen-reader issues — explicitly reason
  about focus order, focus visibility, and announced state even when not shown.
- Don't accept "it looks fine" — accessibility failures are often invisible to
  sighted, mouse-using reviewers.
