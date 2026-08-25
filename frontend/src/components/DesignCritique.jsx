import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MarkdownRenderer from './MarkdownRenderer';
import useExportVerdict from '../hooks/useExportVerdict';
import usePublishVerdict from '../hooks/usePublishVerdict';
import { displayModelName } from '../utils/modelNames';
import './DesignCritique.css';

const SEVERITY_META = {
  0: { label: 'Note',     tone: 'note' },
  1: { label: 'Minor',    tone: 'low'  },
  2: { label: 'Moderate', tone: 'med'  },
  3: { label: 'Major',    tone: 'high' },
  4: { label: 'Critical', tone: 'crit' },
};

function pinTone(pin) {
  if (pin.category === 'strength') return 'good';
  return SEVERITY_META[pin.severity]?.tone || 'med';
}

function sevLabel(pin) {
  if (pin.category === 'strength') return 'Strength';
  return SEVERITY_META[pin.severity]?.label || 'Note';
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M7 6.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="7" cy="4.5" r="0.75" fill="currentColor"/>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 2v7m0 0l-2.5-2.5M7 9l2.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2.5 10.5v1a.5.5 0 00.5.5h8a.5.5 0 00.5-.5v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M1.5 7h11M7 1.5c1.5 1.5 2.2 3.5 2.2 5.5s-.7 4-2.2 5.5c-1.5-1.5-2.2-3.5-2.2-5.5s.7-4 2.2-5.5z" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  );
}

export default function DesignCritique({
  image,
  verdict,
  annotations,
  loading,
  loadingStatus,
  title,
  conversationId,
  councilMembers,
}) {
  const [activeIndex, setActiveIndex]   = useState(null);
  const [showVerdict, setShowVerdict]   = useState(false);
  const [showInfo, setShowInfo]         = useState(false);
  const [popoverPos, setPopoverPos]     = useState({ top: 20, left: 20 });
  const [copiedLink, setCopiedLink]     = useState(false);
  const { exportState, exportResult, exportError, exportVerdict } = useExportVerdict(conversationId);
  const { publishState, publishUrl, publishError, publishVerdict } = usePublishVerdict(conversationId);
  const pinRefs   = useRef([]);
  const bigImgRef = useRef(null);
  const thumbRef  = useRef(null);
  const rightColRef = useRef(null);
  const wrapRef = useRef(null);
  const midGuideRef = useRef(null);
  const flipFromRectRef = useRef(null);
  const members = Array.isArray(councilMembers)
    ? councilMembers.map((member) => displayModelName(member))
    : [];

  const generatedDate = useMemo(() => new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  }), []);

  const pins      = Array.isArray(annotations) ? annotations : [];
  const hasPins   = pins.length > 0;
  const popoverOpen = activeIndex !== null;
  const activePin   = activeIndex !== null ? pins[activeIndex] : null;

  // Position the popover in viewport (fixed) coords beside the clicked pin,
  // flipping/clamping so it never goes off-screen or gets clipped by the frame.
  const positionPopover = useCallback((pinBtn) => {
    if (!pinBtn) return;
    const pinRect = pinBtn.getBoundingClientRect();
    const popW = 340;
    const popH = Math.min(360, window.innerHeight - 24);
    const margin = 12;

    // Prefer to the right of the pin; flip left if it would overflow.
    let left = pinRect.right + 14;
    if (left + popW > window.innerWidth - margin) {
      left = pinRect.left - popW - 14;
    }
    if (left < margin) left = margin;

    // Vertically center on the pin, then clamp into the viewport.
    let top = pinRect.top + pinRect.height / 2 - popH / 2;
    if (top + popH > window.innerHeight - margin) top = window.innerHeight - popH - margin;
    if (top < margin) top = margin;

    setPopoverPos({ top, left });
  }, []);

  // Reset when a new critique arrives
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setActiveIndex(null);
    setShowVerdict(false);
  }, [annotations]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Escape closes popover; keep it repositioned on scroll/resize while open
  useEffect(() => {
    if (!popoverOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setActiveIndex(null); };
    const reposition = () => positionPopover(pinRefs.current[activeIndex]);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [popoverOpen, activeIndex, positionPopover]);

  // Measure the content-column left edge so the middle guide line can be a
  // full-height, viewport-pinned line identical to the left/right guides.
  useLayoutEffect(() => {
    if (!showVerdict) return undefined;
    const GUIDE = 120;
    const measure = () => {
      // Align the verdict wrap exactly between the two 120px viewport guides.
      const wrap = wrapRef.current;
      if (wrap) {
        wrap.style.marginLeft = '0px';
        wrap.style.width = '100%';
        const left = wrap.getBoundingClientRect().left;
        wrap.style.marginLeft = `${Math.round(GUIDE - left)}px`;
        wrap.style.width = `${Math.round(window.innerWidth - GUIDE * 2)}px`;
      }
      // Middle guide sits at the content column's left edge.
      if (rightColRef.current && midGuideRef.current) {
        const x = Math.round(rightColRef.current.getBoundingClientRect().left);
        midGuideRef.current.style.left = `${x}px`;
        midGuideRef.current.style.opacity = '1';
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [showVerdict]);

  // FLIP: morph the shared design image between the large annotated view and
  // the small verdict thumbnail so the transition feels like one shrinking image.
  useLayoutEffect(() => {
    const from = flipFromRectRef.current;
    flipFromRectRef.current = null;
    if (!from) return undefined;
    const targetEl = showVerdict ? thumbRef.current : bigImgRef.current;
    if (!targetEl) return undefined;
    const to = targetEl.getBoundingClientRect();
    if (!to.width || !to.height) return undefined;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    targetEl.style.transformOrigin = 'top left';
    targetEl.style.transition = 'none';
    targetEl.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    void targetEl.getBoundingClientRect();
    const raf = requestAnimationFrame(() => {
      targetEl.style.transition = 'transform 460ms cubic-bezier(0.22, 1, 0.36, 1)';
      targetEl.style.transform = 'none';
    });
    const done = window.setTimeout(() => {
      targetEl.style.transition = '';
      targetEl.style.transformOrigin = '';
    }, 540);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(done); };
  }, [showVerdict]);

  const handleSelectPin = (index, pinBtn) => {
    setShowVerdict(false);
    if (activeIndex === index) {
      setActiveIndex(null);
    } else {
      setActiveIndex(index);
      positionPopover(pinBtn);
    }
  };

  // Capture the currently-visible image rect, then swap instantly — the FLIP
  // effect morphs the shared image between large view and small thumbnail.
  const transitionTo = (toVerdict) => {
    setActiveIndex(null);
    const sourceEl = showVerdict ? thumbRef.current : bigImgRef.current;
    flipFromRectRef.current = sourceEl ? sourceEl.getBoundingClientRect() : null;
    setShowVerdict(toVerdict);
  };

  const navigatePin = (delta) => {
    const i = (activeIndex + delta + pins.length) % pins.length;
    setActiveIndex(i);
    positionPopover(pinRefs.current[i]);
  };

  // ── Full verdict two-column layout ───────────────────────────────────────
  if (showVerdict) {
    return (
      <div className="dc-verdict-wrap" ref={wrapRef}>
        <div ref={midGuideRef} className="dc-mid-guide" style={{ opacity: 0 }} aria-hidden="true" />
        <div className="dc-verdict-left">
          {image && (
            <img ref={thumbRef} className="dc-verdict-thumb" src={image} alt="Design thumbnail" />
          )}
          <button
            type="button"
            className="btn-hide-verdict"
            onClick={() => transitionTo(false)}
          >
            Hide verdict
          </button>

          <button
            type="button"
            className={`btn-verdict-info${showInfo ? ' is-open' : ''}`}
            onClick={() => setShowInfo((v) => !v)}
            aria-expanded={showInfo}
          >
            <InfoIcon /> Council details
          </button>

          {showInfo && (
            <div className="dc-info-panel" role="dialog" aria-label="Design Critique Council">
              <p className="dc-info-title">⛰️ Design Critique Council</p>
              {members.length > 0 ? (
                <ul className="dc-info-chips">
                  {members.map((member) => (
                    <li key={member} className="dc-info-chip">{member}</li>
                  ))}
                </ul>
              ) : (
                <p className="dc-info-date">OpenRouter council models</p>
              )}
              <p className="dc-info-date">{`Generated ${generatedDate}`}</p>
            </div>
          )}

          <button
            type="button"
            className="btn-download-html"
            onClick={exportVerdict}
            disabled={exportState === 'loading'}
          >
            <DownloadIcon />
            {exportState === 'loading' ? 'Downloading…' : 'Download HTML'}
          </button>

          {publishState === 'done' && publishUrl ? (
            <div className="dc-publish-success-group">
              <a
                href={publishUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-publish-web btn-publish-web--view"
              >
                <GlobeIcon /> View live verdict ↗
              </a>
              <button
                type="button"
                className="btn-copy-link"
                onClick={() => {
                  navigator.clipboard.writeText(publishUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
              >
                {copiedLink ? '✓ Copied link!' : 'Copy public link'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-publish-web"
              onClick={publishVerdict}
              disabled={publishState === 'loading'}
            >
              <GlobeIcon />
              {publishState === 'loading' ? 'Publishing to web…' : 'Publish to web'}
            </button>
          )}

          {exportState === 'done' && exportResult && (
            <div className="dc-export-ok">
              <strong>Downloaded {exportResult}.</strong>
            </div>
          )}
          {exportState === 'error' && (
            <div className="dc-export-err">{exportError}</div>
          )}
          {publishState === 'error' && (
            <div className="dc-export-err">{publishError}</div>
          )}
        </div>

        <div className="dc-verdict-right" ref={rightColRef}>
          <div className="dc-verdict-body">
            <MarkdownRenderer html={verdict?.response_html} fallback={verdict?.response || ''} />
          </div>
        </div>
      </div>
    );
  }

  // ── Main annotated-image view ─────────────────────────────────────────────
  return (
    <div
      className="design-critique"
      onClick={(e) => {
        if (
          popoverOpen &&
          !e.target.closest('.dc-popover') &&
          !e.target.closest('.dc-pin')
        ) {
          setActiveIndex(null);
        }
      }}
    >
      <div className="dc-stage">
        <div className={`dc-canvas${loading ? ' dc-canvas--loading' : ''}`}>
          <div className="dc-image-frame">
            <img
              ref={bigImgRef}
              className="dc-image"
              src={image}
              alt={title || 'Reviewed design'}
              draggable={false}
            />


            {/* Annotation pins */}
            {!loading && hasPins && pins.map((pin, index) => (
              <button
                key={index}
                ref={(el) => { pinRefs.current[index] = el; }}
                type="button"
                className={`dc-pin dc-pin--${pinTone(pin)}${activeIndex === index ? ' dc-pin--active' : ''}`}
                style={{
                  left: `${pin.x}%`,
                  top:  `${pin.y}%`,
                  animationDelay: `${index * 60}ms`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectPin(index, e.currentTarget);
                }}
                aria-label={`${pin.title} — ${sevLabel(pin)}`}
                aria-pressed={activeIndex === index}
              >
                <span className="dc-pin-dot">{index + 1}</span>
              </button>
            ))}

          </div>

          {/* Floating annotation popover — portaled so it's never clipped and
              sits on top of everything, positioned in viewport coords. */}
          {popoverOpen && activePin && createPortal(
            <div
              className="dc-popover"
              style={{ top: popoverPos.top, left: popoverPos.left }}
              role="dialog"
              aria-label="Annotation detail"
            >
              <div className="dc-popover-body">
                <button
                  className="dc-popover-close"
                  onClick={() => setActiveIndex(null)}
                  aria-label="Close"
                >×</button>

                <div className="dc-badge">
                  <span className="dc-badge-num">{activeIndex + 1}</span>
                  <span className={`dc-badge-label dc-badge-label--${pinTone(activePin)}`}>{sevLabel(activePin)}</span>
                </div>

                <h3 className="dc-detail-title">{activePin.title}</h3>

                {activePin.principle && (
                  <p className="dc-detail-principle">{activePin.principle}</p>
                )}
                {activePin.comment && (
                  <p className="dc-detail-comment">{activePin.comment}</p>
                )}

                {pins.length > 1 && (
                  <div className="dc-detail-nav">
                    <button className="btn" onClick={() => navigatePin(-1)}>‹ Previous</button>
                    <button className="btn" onClick={() => navigatePin(1)}>Next ›</button>
                  </div>
                )}
              </div>
            </div>,
            document.body
          )}

          {/* Loading caption */}
          {loading && (
            <div className="dc-loading-caption">
              <span className="dc-loading-spinner" />
              {loadingStatus || 'The council is reviewing your design…'}
            </div>
          )}
        </div>

        {/* Stage footer — stacked: hint above, button below */}
        {!loading && hasPins && (
          <div className="dc-stage-footer">
            <p className="dc-stage-hint">
              {pins.length} annotation{pins.length === 1 ? '' : 's'}
              {' · tap a circle to read the feedback'}
            </p>
            <button
              type="button"
              className="btn-verdict"
              onClick={() => transitionTo(true)}
            >
              View full verdict
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
