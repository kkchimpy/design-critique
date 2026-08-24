import { useState, useEffect, useRef } from 'react';
import Stage1 from './Stage1';
import Stage2 from './Stage2';
import Stage3 from './Stage3';
import DesignCritique from './DesignCritique';
import DiamondDitherBackground from './DiamondDitherBackground';
import { prepareImage } from '../utils/prepareImage';
import './ChatInterface.css';

const IconAttach = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M13.5 7.5l-6 6a4 4 0 01-5.657-5.657l6.364-6.364a2.5 2.5 0 013.535 3.536L5.379 11.37a1 1 0 01-1.414-1.415L10.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const SpinnerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="thinking-spinner">
    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="20 14"/>
  </svg>
);

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatInterface({
  conversation,
  onSendMessage,
  isLoading,
  errorMessage,
}) {
  const [input, setInput] = useState('');
  const [image, setImage] = useState(null);
  const [imageError, setImageError] = useState('');
  const [imageInfo, setImageInfo] = useState(null);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isCanvasDragActive, setIsCanvasDragActive] = useState(false);
  const chatInterfaceRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const landingRef = useRef(null);
  const formRef = useRef(null);
  const imageRequestRef = useRef(0);
  const autoScrollRef = useRef(true);
  const dragDepthRef = useRef(0);
  const hasMessages = conversation?.messages?.length > 0;

  useEffect(() => {
    const scrollRoot = chatInterfaceRef.current;
    if (!scrollRoot) {
      return undefined;
    }

    const handleScroll = () => {
      const remaining = scrollRoot.scrollHeight - (scrollRoot.scrollTop + scrollRoot.clientHeight);
      autoScrollRef.current = remaining < 160;
    };

    handleScroll();
    scrollRoot.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollRoot.removeEventListener('scroll', handleScroll);
  }, [hasMessages]);

  useEffect(() => {
    if (autoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [conversation]);

  // Auto-focus textarea whenever landing (no messages yet)
  useEffect(() => {
    const hasMessages = conversation?.messages?.length > 0;
    if (!hasMessages && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [conversation]);

  const processImageFile = async (file) => {
    if (!file) return;
    setImageError('');
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!Number.isFinite(file.size) || file.size <= 0) {
      setImageError('The selected image is empty.');
      return;
    }
    if (!allowed.includes(file.type)) {
      setImageError('Please upload a PNG, JPG, or WebP image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImageError('Image is too large (max 10 MB).');
      return;
    }
    const requestId = imageRequestRef.current + 1;
    imageRequestRef.current = requestId;
    setIsPreparingImage(true);
    try {
      const prepared = await prepareImage(file);
      if (requestId !== imageRequestRef.current) return;
      setImage(prepared.dataUrl);
      setImageInfo({
        width: prepared.width,
        height: prepared.height,
        originalBytes: prepared.originalBytes,
        optimizedBytes: prepared.optimizedBytes,
      });
    } catch (error) {
      if (requestId === imageRequestRef.current) {
        setImageError(error.message || 'Failed to prepare the image file.');
      }
    } finally {
      if (requestId === imageRequestRef.current) setIsPreparingImage(false);
    }
  };

  const handleImageSelect = (e) => {
    processImageFile(e.target.files?.[0]);
  };

  const hasDraggedFiles = (event) => {
    const types = event.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
  };

  const resetDragState = () => {
    dragDepthRef.current = 0;
    setIsCanvasDragActive(false);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasDraggedFiles(e)) return;
    dragDepthRef.current += 1;
    setIsCanvasDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasDraggedFiles(e)) return;
    dragDepthRef.current = Math.max(dragDepthRef.current - 1, 0);
    if (dragDepthRef.current === 0) {
      setIsCanvasDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetDragState();
    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) { processImageFile(file); break; }
      }
    }
  };

  const handleRemoveImage = () => {
    imageRequestRef.current += 1;
    setImage(null);
    setImageInfo(null);
    setIsPreparingImage(false);
    setImageError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if ((input.trim() || image) && !isLoading && !isPreparingImage) {
      const submitted = await onSendMessage(input, image);
      if (submitted !== false) {
        setInput('');
        setImage(null);
        setImageInfo(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  /* ── No conversation / empty conversation — show landing ── */
  if (!hasMessages) {
    return (
      <div
        className={`chat-interface chat-interface--landing${isCanvasDragActive ? ' chat-interface--drag-active' : ''}`}
        ref={landingRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <DiamondDitherBackground />
        <div className="landing-center">
          <form
            className="chat-input-form chat-input-form--enter landing-chat"
            ref={formRef}
            onSubmit={handleSubmit}
          >
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageSelect} style={{ display: 'none' }} />

            <div className="landing-titlebox">
              <h1 className="landing-heading">What running in your head?</h1>

              {image && (
                <div className="landing-image-block">
                  <div className="landing-image-frame">
                    <img src={image} alt="Design to review" />
                    <button type="button" className="image-remove" onClick={handleRemoveImage} aria-label="Remove image">×</button>
                  </div>
                  {isPreparingImage && <p className="image-meta">Preparing image…</p>}
                  {!isPreparingImage && imageInfo && (
                    <p className="image-meta">
                      {imageInfo.width} × {imageInfo.height} · {formatBytes(imageInfo.optimizedBytes)}
                      {imageInfo.optimizedBytes < imageInfo.originalBytes ? ` (from ${formatBytes(imageInfo.originalBytes)})` : ''}
                    </p>
                  )}
                </div>
              )}
              {isPreparingImage && !image && <p className="image-meta">Preparing image…</p>}

              <div
                className="landing-textbox"
                onDrop={handleDrop}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
              >
                <textarea
                  ref={textareaRef}
                  className="landing-textarea"
                  placeholder="Enter your thoughts, context and outcomes needed to start brainstorm or simply upload a design screen for an open critique"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  rows={2}
                  autoFocus
                />
              </div>
            </div>

            {imageError && <p className="image-error">{imageError}</p>}
            {errorMessage && <p className="chat-error" role="alert">{errorMessage}</p>}

            <div className="landing-action-row">
              <div className="landing-action-left">
                <button
                  type="button"
                  className="attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach a design image (PNG, JPG, WebP)"
                >
                  <IconAttach />
                </button>
              </div>
              <button
                type="submit"
                className="submit-btn"
                disabled={(!input.trim() && !image) || isLoading || isPreparingImage}
              >
                {image ? 'Critique my design' : 'Start brainstorming'}
              </button>
            </div>
          </form>
        </div>


      </div>
    );
  }

  /* ── Find the latest user message and the latest assistant message ── */
  const msgs = conversation.messages;
  const lastUserMsg = [...msgs].reverse().find((m) => m.role === 'user');
  const lastAssistantMsg = [...msgs].reverse().find((m) => m.role === 'assistant');

  /* ── Image-critique mode: full-image annotation view (Figma 12:4349) ── */
  const isDesignMode = Boolean(lastUserMsg?.image) || lastAssistantMsg?.mode === 'design';
  if (isDesignMode && lastUserMsg?.image) {
    const stagesDone = Boolean(lastAssistantMsg?.stage3);
    const annotationsPending = lastAssistantMsg?.loading?.annotations;
    // Show the loading veil until the verdict is synthesized AND its
    // annotations have been localized onto the image.
    const critiqueLoading = isLoading || !stagesDone || annotationsPending;

    return (
      <div className="chat-interface chat-interface--design" ref={chatInterfaceRef}>
        <div className="messages-container messages-container--design">
          {errorMessage && (
            <div className="chat-error chat-error--panel answer-enter" role="alert">
              {errorMessage}
            </div>
          )}

          <DesignCritique
            image={lastUserMsg.image}
            title={conversation.title}
            verdict={lastAssistantMsg?.stage3}
            annotations={lastAssistantMsg?.annotations}
            loading={critiqueLoading}
            conversationId={conversation.id}
            councilMembers={lastAssistantMsg?.metadata?.council_models}
          />

          <form className="follow-up-form" onSubmit={handleSubmit}>
            <textarea
              className="follow-up-input"
              rows={1}
              placeholder="Ask a follow-up about this design"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <button className="submit-btn" type="submit" disabled={!input.trim() || isLoading}>
              Ask follow-up
            </button>
          </form>

          <div ref={messagesEndRef} />
        </div>
      </div>
    );
  }

  /* ── Conversation view ── */
  return (
    <div className="chat-interface" ref={chatInterfaceRef}>
      <div className="messages-container">
        {errorMessage && (
          <div className="chat-error chat-error--panel answer-enter" role="alert">
            {errorMessage}
          </div>
        )}

        {/* ─── Question recap + loading state (Figma 12:4349) ─── */}
        {lastUserMsg ? (
          <div className={`question-recap answer-enter${isLoading ? ' question-recap--loading' : ''}`}>
            <span className="question-label">your question</span>
            <div className="question-field">
              {lastUserMsg.image && (
                <img className="question-field-image" src={lastUserMsg.image} alt="Uploaded design" />
              )}
              <p>{lastUserMsg.content?.trim() || (lastUserMsg.image ? 'Uploaded design for critique' : 'No written prompt provided')}</p>
            </div>
            {isLoading && (
              <div className="question-actions">
                <div className="council-thinking-btn">
                  <SpinnerIcon />
                  Council is thinking
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* ─── Stage results — animate in as each stage completes ─── */}
        {msgs.map((msg, index) => {
          if (msg.role !== 'assistant') return null;
          return (
            <div key={`assistant-${index}`} className="assistant-message answer-enter">
              {msg.loading?.stage1 && (
                <div className="stage-loading answer-enter">
                  <div className="spinner" />
                  <span>Stage 1 — gathering individual responses...</span>
                </div>
              )}

              {msg.stage1 && (
                <div className="answer-enter">
                  <Stage1 responses={msg.stage1} />
                </div>
              )}

              {msg.loading?.stage2 && (
                <div className="stage-loading answer-enter">
                  <div className="spinner" />
                  <span>Stage 2 — peer rankings...</span>
                </div>
              )}

              {msg.stage2 && (
                <div className="answer-enter">
                  <Stage2
                    rankings={msg.stage2}
                    labelToModel={msg.metadata?.label_to_model}
                    aggregateRankings={msg.metadata?.aggregate_rankings}
                  />
                </div>
              )}

              {msg.loading?.stage3 && (
                <div className="stage-loading answer-enter">
                  <div className="spinner" />
                  <span>Stage 3 — final synthesis...</span>
                </div>
              )}

              {msg.stage3 && (
                <div className="answer-enter">
                  <Stage3
                    finalResponse={msg.stage3}
                    isDesign={msg.mode === 'design'}
                    conversationId={conversation.id}
                  />
                </div>
              )}
            </div>
          );
        })}

        <form className="follow-up-form" onSubmit={handleSubmit}>
          <textarea
            className="follow-up-input"
            rows={1}
            placeholder="Ask a follow-up question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button className="submit-btn" type="submit" disabled={!input.trim() || isLoading}>
            Ask follow-up
          </button>
        </form>

        <div ref={messagesEndRef} />
      </div>

    </div>
  );
}

