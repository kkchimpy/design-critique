import { useEffect, useState } from 'react';
import './Sidebar.css';

const IconChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M10 12L6 8l4-4M14 12l-4-4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 12l4-4-4-4M4 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconMessageAdd = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path fillRule="evenodd" clipRule="evenodd" d="M14 1H2a1 1 0 00-1 1v9.586L4.414 15H14a1 1 0 001-1V2a1 1 0 00-1-1zM8 4.5a.5.5 0 00-1 0V7H4.5a.5.5 0 000 1H7v2.5a.5.5 0 001 0V8h2.5a.5.5 0 000-1H8V4.5z" fill="currentColor"/>
  </svg>
);

const IconPalette = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 2a6 6 0 100 11.8c.8 0 1.5-.5 1.5-1.3 0-.4-.1-.7-.3-.9-.2-.3-.3-.5-.3-.8 0-.7.6-1.3 1.3-1.3H12c1.1 0 2-.9 2-2A6 6 0 008 2z"/>
    <circle cx="5.5" cy="7.5" r="1" fill="white"/>
    <circle cx="7.5" cy="4.5" r="1" fill="white"/>
    <circle cx="10.5" cy="5.5" r="1" fill="white"/>
  </svg>
);

const IconChat = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1 2.5A1.5 1.5 0 012.5 1h11A1.5 1.5 0 0115 2.5v7A1.5 1.5 0 0113.5 11H5.414L2 14.414V2.5z"/>
  </svg>
);

const IconTrash = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <path d="M6.5 1h3a.5.5 0 010 1h-3a.5.5 0 010-1zM3 4h10l-1 10H4L3 4zm2.5 2a.5.5 0 00-.5.5v5a.5.5 0 001 0v-5a.5.5 0 00-.5-.5zm3 0a.5.5 0 00-.5.5v5a.5.5 0 001 0v-5a.5.5 0 00-.5-.5zm3 0a.5.5 0 00-.5.5v5a.5.5 0 001 0v-5a.5.5 0 00-.5-.5z" fill="currentColor"/>
  </svg>
);

const IconGear = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 5a3 3 0 100 6A3 3 0 008 5zm-1 3a1 1 0 112 0 1 1 0 01-2 0z"/>
    <path d="M9.93 1.54a2 2 0 00-3.86 0L5.8 2.1a6 6 0 00-1.53.88l-.55-.14a2 2 0 00-2.3 1.37l-.38 1.16a2 2 0 001.07 2.44l.51.22c-.03.3-.03.6 0 .9l-.51.22a2 2 0 00-1.07 2.44l.38 1.16a2 2 0 002.3 1.37l.55-.14c.47.35.99.64 1.53.88l.27.56a2 2 0 003.86 0l.27-.56a6 6 0 001.53-.88l.55.14a2 2 0 002.3-1.37l.38-1.16a2 2 0 00-1.07-2.44l-.51-.22c.03-.3.03-.6 0-.9l.51-.22a2 2 0 001.07-2.44l-.38-1.16a2 2 0 00-2.3-1.37l-.55.14a6 6 0 00-1.53-.88l-.27-.56zM8 3a5 5 0 110 10A5 5 0 018 3z"/>
  </svg>
);

const IconReset = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M13.5 3.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M13 7A5 5 0 103.8 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function Counter({ count }) {
  return (
    <span className="nav-counter">{count}</span>
  );
}

function NavSection({ icon, label, count, children }) {
  return (
    <div className="nav-section">
      <div className="nav-section-header">
        <div className="nav-section-header-left">
          <span className="nav-section-icon">{icon}</span>
          <span className="nav-section-label">{label}</span>
        </div>
        <Counter count={count} />
      </div>
      <div className="nav-section-items">{children}</div>
    </div>
  );
}

function NavItem({ title, isActive, onClick, onDelete }) {
  return (
    <div
      className={`nav-item${isActive ? ' nav-item--active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <span className="nav-item-indent" />
      <span className="nav-item-text">{title || 'New Conversation'}</span>
      <button
        className="nav-item-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        aria-label="Delete conversation"
        title="Delete"
      >
        <IconTrash />
      </button>
    </div>
  );
}

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onResetAll,
  onOpenSetup,
}) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    if (isCollapsed) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsCollapsed(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCollapsed]);

  const designConvs = conversations.filter((c) => c.mode === 'design');
  const textConvs = conversations.filter((c) => c.mode !== 'design');

  return (
    <>
      {isCollapsed ? (
        <aside className="sidebar sidebar--collapsed sidebar-fade">
          <button
            className="sidebar-expand-btn"
            onClick={() => setIsCollapsed(false)}
            aria-label="Expand navigation"
          >
            <IconChevronRight />
          </button>
        </aside>
      ) : (
        <>
          <button
            type="button"
            className="sidebar-backdrop sidebar-fade"
            aria-label="Close navigation"
            onClick={() => setIsCollapsed(true)}
          />
          <aside className="sidebar sidebar--overlay sidebar-slide">
      {/* Header */}
      <div className="sidebar-header">
        <span className="sidebar-title">LLM Council</span>
        <div className="sidebar-header-actions">
          <button
            className="sidebar-settings-btn"
            onClick={onResetAll}
            aria-label="Reset all conversations"
            title="Reset all conversations and answers"
          >
            <IconReset />
          </button>
          <button
            className="sidebar-settings-btn"
            onClick={onOpenSetup}
            aria-label="API key settings"
            title="Configure API keys"
          >
            <IconGear />
          </button>
          <button
            className="sidebar-collapse-btn"
            onClick={() => setIsCollapsed(true)}
            aria-label="Collapse navigation"
          >
            <IconChevronLeft />
          </button>
        </div>
      </div>

      {/* New conversation button */}
      <div className="sidebar-new-btn-row">
        <button className="sidebar-new-btn" onClick={onNewConversation}>
          <IconMessageAdd />
          <span>New conversation</span>
        </button>
      </div>

      {/* Conversation list */}
      <div className="sidebar-list">
        <NavSection
          icon={<IconPalette />}
          label="Design critiques"
          count={designConvs.length}
        >
          {designConvs.map((conv) => (
            <NavItem
              key={conv.id}
              title={conv.title}
              isActive={conv.id === currentConversationId}
              onClick={() => onSelectConversation(conv.id)}
              onDelete={() => onDeleteConversation(conv.id)}
            />
          ))}
          {designConvs.length === 0 && (
            <p className="nav-empty">No design critiques yet</p>
          )}
        </NavSection>

        <NavSection
          icon={<IconChat />}
          label="Text conversations"
          count={textConvs.length}
        >
          {textConvs.map((conv) => (
            <NavItem
              key={conv.id}
              title={conv.title}
              isActive={conv.id === currentConversationId}
              onClick={() => onSelectConversation(conv.id)}
              onDelete={() => onDeleteConversation(conv.id)}
            />
          ))}
          {textConvs.length === 0 && (
            <p className="nav-empty">No conversations yet</p>
          )}
        </NavSection>
      </div>
          </aside>
        </>
      )}
    </>
  );
}

