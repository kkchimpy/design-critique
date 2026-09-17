# Design system tokens

This directory is the canonical source of truth for the public-facing Design Critique visual language.

## Canonical file

- `tokens.css` defines the shared palette, spacing, radii, and layout primitives used by the local UI and exported verdict HTML.

## Rules

- Do not maintain a second token copy in app CSS or backend HTML templates.
- Update the canonical token file first, then regenerate any downstream static HTML or token-derived styles.
- Keep the Figma values from the public release plan authoritative when they differ from earlier ad hoc tokens.
