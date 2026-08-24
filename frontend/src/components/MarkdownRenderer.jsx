import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './MarkdownRenderer.css';

function isSafeUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function sanitizeHtml(html) {
  if (!html || typeof DOMParser === 'undefined') return '';
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script, style, iframe, object, embed, form, img, input, textarea, select').forEach((node) => node.remove());
  parsed.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const allowed = attribute.name === 'class'
        || attribute.name === 'target'
        || attribute.name === 'rel'
        || attribute.name.startsWith('data-principle-');
      if (!allowed) node.removeAttribute(attribute.name);
    });
    if (node.tagName === 'A') {
      const href = node.getAttribute('href');
      if (!isSafeUrl(href)) node.removeAttribute('href');
      node.setAttribute('rel', 'noreferrer noopener');
      node.setAttribute('target', '_blank');
    }
  });
  return parsed.body.innerHTML;
}

function PrincipleTooltip({ tooltip }) {
  if (!tooltip || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="principle-tooltip"
      role="tooltip"
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      <strong>{tooltip.label}</strong>
      <span>{tooltip.definition}</span>
      {tooltip.url && isSafeUrl(tooltip.url) && (
        <a href={tooltip.url} target="_blank" rel="noreferrer noopener">
          Read article: {tooltip.articleLabel || 'reference'}
        </a>
      )}
    </div>,
    document.body
  );
}

export default function MarkdownRenderer({ html, fallback = '' }) {
  const rootRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const safeHtml = useMemo(() => sanitizeHtml(html), [html]);

  const showTooltip = useCallback((event) => {
    const trigger = event.target.closest('.p-ref');
    if (!trigger || !rootRef.current?.contains(trigger)) return;
    const rect = trigger.getBoundingClientRect();
    setTooltip({
      label: trigger.dataset.principleLabel || 'Design principle',
      definition: trigger.dataset.principleDefinition || '',
      url: trigger.dataset.principleUrl || '',
      articleLabel: trigger.dataset.principleArticleLabel || '',
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 372)),
      top: Math.max(12, rect.bottom + 10),
    });
  }, []);

  const hideTooltip = useCallback(() => setTooltip(null), []);

  if (!safeHtml) return <>{fallback}</>;

  return (
    <>
      <div
        ref={rootRef}
        onMouseOver={showTooltip}
        onFocus={showTooltip}
        onMouseOut={hideTooltip}
        onBlur={hideTooltip}
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
      <PrincipleTooltip tooltip={tooltip} />
    </>
  );
}
