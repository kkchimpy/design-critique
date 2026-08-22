import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PRINCIPLES = [
  {
    label: 'Visual Hierarchy & Gestalt',
    color: '#8d78cf',
    definition: 'People perceive nearby, similar, aligned, or enclosed elements as groups. Use spacing, contrast, and order to make relationships clear at a glance.',
    articleUrl: 'https://en.wikipedia.org/wiki/Principles_of_grouping',
    articleLabel: 'Principles of grouping',
    words: ['visual hierarchy', 'gestalt', 'grouping', 'proximity', 'similarity'],
  },
  {
    label: 'Learnability & Discovery',
    color: '#d47a45',
    definition: 'Users should be able to discover what actions are possible and build a reliable mental model without needing prior instruction.',
    articleUrl: 'https://www.nngroup.com/articles/ten-usability-heuristics/',
    articleLabel: 'Nielsen heuristics',
    words: ['learnab', 'discoverabil', 'affordance', 'heuristic', 'mental model', 'consistency'],
  },
  {
    label: 'Error Prevention & Feedback',
    color: '#d93670',
    definition: 'Good interfaces prevent problems before they happen and give clear, timely feedback with an obvious recovery path when something needs attention.',
    articleUrl: 'https://www.nngroup.com/articles/ten-usability-heuristics/',
    articleLabel: 'Nielsen heuristics (#5 & #1)',
    words: ['error', 'feedback', 'recovery', 'undo', 'redo', 'prevention', 'validation', 'confirmation'],
  },
  {
    label: 'Accessibility & WCAG',
    color: '#1a5a5a',
    definition: 'Interfaces should be perceivable, operable, understandable, and robust for people using different abilities, devices, inputs, and assistive tools.',
    articleUrl: 'https://www.w3.org/WAI/WCAG22/quickref/?versions=2.1',
    articleLabel: 'WCAG 2.1 quick ref',
    words: ['accessib', 'wcag', 'contrast', 'aria', 'screen reader', 'colour blind', 'color blind', 'keyboard', 'touch target'],
  },
  {
    label: 'Behaviour & Motivation',
    color: '#b8891d',
    definition: 'A user acts when motivation, ability, and a prompt converge. Reduce friction and place the prompt where the user is ready to act.',
    articleUrl: 'https://www.behaviormodel.org/',
    articleLabel: 'Fogg Behavior Model',
    words: ['fogg', 'behaviour', 'behavior', 'motivation', 'ability', 'prompt', 'trigger', 'call to action'],
  },
  {
    label: 'Content & Microcopy',
    color: '#6aa992',
    definition: 'Interface text should be specific, plain, timely, and action-oriented so users understand what happened and what to do next.',
    articleUrl: 'https://uxcontent.com/10-content-design-heuristics/',
    articleLabel: 'Content design heuristics',
    words: ['microcopy', 'voice', 'tone', 'plain language', 'wording'],
  },
  {
    label: 'Cognitive Load & Friction',
    color: '#d84d3e',
    definition: 'Reduce unnecessary mental effort by simplifying choices, exposing only relevant information, and making state, priority, and next steps obvious.',
    articleUrl: 'https://en.wikipedia.org/wiki/Heuristic_evaluation#Gerhardt-Powals_cognitive_engineering_principles',
    articleLabel: 'Gerhardt-Powals principles',
    words: ['cognitive load', 'cognitive', 'dark pattern', 'overload', 'complexity', 'overwhelm'],
  },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const principlePattern = new RegExp(
  PRINCIPLES.flatMap((principle) => principle.words).map(escapeRegExp).join('|'),
  'gi'
);

function findPrinciple(text) {
  const lower = text.toLowerCase();
  return PRINCIPLES.find((principle) =>
    principle.words.some((word) => lower.includes(word.toLowerCase()))
  );
}

function colorWithAlpha(hex, alpha) {
  const value = hex?.replace('#', '');
  if (!value || value.length !== 6) {
    return `rgba(141, 63, 225, ${alpha})`;
  }

  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function PrincipleReference({ value, principle }) {
  const triggerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const principleColor = principle?.color || '#8d3fe1';

  const closeTooltip = useCallback(() => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setTooltip(null), 140);
  }, []);

  const cancelClose = useCallback(() => {
    window.clearTimeout(closeTimerRef.current);
  }, []);

  const updateTooltipPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const margin = 18;
    const maxWidth = 360;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, margin + maxWidth / 2),
      window.innerWidth - margin - maxWidth / 2
    );
    const placement = rect.top > 92 ? 'top' : 'bottom';
    const top = placement === 'top' ? rect.top - 12 : rect.bottom + 12;

    setTooltip({ left, top, placement });
  }, []);

  const openTooltip = useCallback(() => {
    cancelClose();
    updateTooltipPosition();
  }, [cancelClose, updateTooltipPosition]);

  useEffect(() => {
    if (!tooltip) {
      return undefined;
    }

    const handleUpdate = () => updateTooltipPosition();
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);
    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [tooltip, updateTooltipPosition]);

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  const tooltipNode = tooltip && typeof document !== 'undefined'
    ? createPortal(
        <div
          className={`principle-tooltip principle-tooltip--${tooltip.placement}`}
          style={{
            left: tooltip.left,
            top: tooltip.top,
            '--p-color': principleColor,
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={closeTooltip}
          role="tooltip"
        >
          <span className="principle-tooltip__swatch" />
          <span className="principle-tooltip__body">
            <span className="principle-tooltip__name">{principle?.label || 'Design principle'}</span>
            <span className="principle-tooltip__definition">
              {principle?.definition || 'A design principle used to evaluate usability and clarity.'}
            </span>
            {principle?.articleUrl && (
              <a
                className="principle-tooltip__link"
                href={principle.articleUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                Read article: {principle.articleLabel || 'reference'}
              </a>
            )}
          </span>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <span
        ref={triggerRef}
        className="p-ref"
        data-principle={principle?.label}
        tabIndex={0}
        aria-label={`Principle: ${principle?.label || 'Design principle'}`}
        onMouseEnter={openTooltip}
        onMouseLeave={closeTooltip}
        onFocus={openTooltip}
        onBlur={closeTooltip}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setTooltip(null);
          }
        }}
        style={{
          '--p-color': principleColor,
          '--p-bg': colorWithAlpha(principleColor, 0.1),
          '--p-bg-hover': colorWithAlpha(principleColor, 0.16),
        }}
      >
        {value}
      </span>
      {tooltipNode}
    </>
  );
}

function renderPrincipleText(text, keyPrefix) {
  const parts = [];
  let lastIndex = 0;
  let match;

  principlePattern.lastIndex = 0;
  while ((match = principlePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const value = match[0];
    const principle = findPrinciple(value);
    parts.push(
      <PrincipleReference
        key={`${keyPrefix}-p-${match.index}`}
        value={value}
        principle={principle}
      />
    );
    lastIndex = match.index + value.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function renderInline(text, keyPrefix) {
  const parts = [];
  const tokenPattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderPrincipleText(text.slice(lastIndex, match.index), `${keyPrefix}-${match.index}`));
    }

    const token = match[0];
    const key = `${keyPrefix}-i-${match.index}`;
    if (token.startsWith('`')) {
      parts.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      parts.push(<strong key={key}>{renderPrincipleText(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith('*')) {
      parts.push(<em key={key}>{renderPrincipleText(token.slice(1, -1), key)}</em>);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a key={key} href={linkMatch[2]} target="_blank" rel="noreferrer">
            {renderPrincipleText(linkMatch[1], key)}
          </a>
        );
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(...renderPrincipleText(text.slice(lastIndex), `${keyPrefix}-end`));
  }

  return parts;
}

function normalizeMarkdown(markdown) {
  return String(markdown || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .flatMap((line) => {
      const pipeCount = (line.match(/\|/g) || []).length;
      if (pipeCount >= 6 && /\|\s*:?-{3,}/.test(line) && line.includes('||')) {
        return line.replace(/\s*\|\|\s*/g, '|\n|').split('\n');
      }
      return [line];
    })
    .join('\n');
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function readParagraph(lines, startIndex) {
  const values = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    const next = lines[index + 1]?.trim() || '';

    if (!trimmed) break;
    if (/^#{1,4}\s+/.test(trimmed)) break;
    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) break;
    if (/^>\s?/.test(trimmed)) break;
    if (trimmed.includes('|') && isTableSeparator(next)) break;

    values.push(trimmed);
    index += 1;
  }

  return { text: values.join(' '), nextIndex: index };
}

function sectionSlug(text) {
  const lower = String(text || '').toLowerCase();
  if (lower.includes('next step')) return 'next-steps';
  if (lower.includes('strength')) return 'strengths';
  if (lower.includes('scorecard')) return 'scorecard';
  if (lower.includes('issue')) return 'issues';
  if (lower.includes('verdict')) return 'verdict';
  return lower.trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
}

export default function MarkdownRenderer({ children, sectioned = false }) {
  const lines = normalizeMarkdown(children).split('\n');
  const blocks = [];
  const headings = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      const Tag = `h${level}`;
      if (level <= 2) {
        headings.push({ at: blocks.length, slug: sectionSlug(heading[2]) });
      }
      blocks.push(<Tag key={`h-${index}`}>{renderInline(heading[2], `h-${index}`)}</Tag>);
      index += 1;
      continue;
    }

    if (trimmed.includes('|') && isTableSeparator(lines[index + 1]?.trim() || '')) {
      const headers = splitTableRow(trimmed);
      const rows = [];
      index += 2;

      while (index < lines.length && lines[index].trim().includes('|')) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }

      blocks.push(
        <div className="markdown-table-wrap" key={`table-${index}`}>
          <table>
            <thead>
              <tr>
                {headers.map((header, cellIndex) => (
                  <th key={`th-${cellIndex}`}>{renderInline(header, `th-${index}-${cellIndex}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`tr-${rowIndex}`}>
                  {headers.map((_, cellIndex) => (
                    <td key={`td-${rowIndex}-${cellIndex}`}>
                      {renderInline(row[cellIndex] || '', `td-${index}-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${index}`}>
          {items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `ul-${index}-${itemIndex}`)}</li>)}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${index}`}>
          {items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `ol-${index}-${itemIndex}`)}</li>)}
        </ol>
      );
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quotes = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quotes.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(<blockquote key={`q-${index}`}>{renderInline(quotes.join(' '), `q-${index}`)}</blockquote>);
      continue;
    }

    const paragraph = readParagraph(lines, index);
    blocks.push(<p key={`p-${index}`}>{renderInline(paragraph.text, `p-${index}`)}</p>);
    index = paragraph.nextIndex;
  }

  if (!sectioned || headings.length === 0) {
    return <>{blocks}</>;
  }

  // Group blocks into <section> wrappers keyed by each h1/h2 heading so the
  // verdict view can colour-code sections (Figma 48:949).
  const sections = [];
  const leading = blocks.slice(0, headings[0].at);
  if (leading.length) {
    sections.push(<div key="md-lead" className="md-section md-section--lead">{leading}</div>);
  }
  headings.forEach((h, i) => {
    const end = i + 1 < headings.length ? headings[i + 1].at : blocks.length;
    sections.push(
      <section key={`md-sec-${i}`} className={`md-section md-section--${h.slug}`}>
        {blocks.slice(h.at, end)}
      </section>
    );
  });

  return <>{sections}</>;
}