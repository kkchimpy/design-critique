import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import SetupModal from './components/SetupModal';
import { getKeyStatus } from './components/setupKeys';
import { normalizeModelName } from './utils/modelNames';
import { api } from './api';
import './App.css';

function normalizeStageResponse(payload, fallbackModel = 'Council') {
  if (!payload) {
    return null;
  }

  if (typeof payload === 'string') {
    return {
      model: fallbackModel,
      response: payload,
    };
  }

  if (typeof payload !== 'object') {
    return null;
  }

  return {
    ...payload,
    model: normalizeModelName(payload.model, fallbackModel),
    response: typeof payload.response === 'string' ? payload.response : '',
  };
}

function normalizeAssistantMessage(message) {
  const stage1 = Array.isArray(message.stage1)
    ? message.stage1
        .map((entry, index) => normalizeStageResponse(entry, `Model ${index + 1}`))
        .filter(Boolean)
    : null;

  const stage2 = Array.isArray(message.stage2)
    ? message.stage2
        .map((entry, index) => {
          if (typeof entry === 'string') {
            return {
              model: `Model ${index + 1}`,
              ranking: entry,
              parsed_ranking: [],
            };
          }

          if (!entry || typeof entry !== 'object') {
            return null;
          }

          return {
            ...entry,
            model: normalizeModelName(entry.model, `Model ${index + 1}`),
            ranking: typeof entry.ranking === 'string' ? entry.ranking : '',
            parsed_ranking: Array.isArray(entry.parsed_ranking)
              ? entry.parsed_ranking.filter((label) => typeof label === 'string')
              : [],
          };
        })
        .filter(Boolean)
    : null;

  const annotations = Array.isArray(message.annotations)
    ? message.annotations
        .map((pin) => (pin && typeof pin === 'object' ? pin : null))
        .filter(Boolean)
    : null;

  return {
    role: 'assistant',
    stage1,
    stage2,
    stage3: normalizeStageResponse(message.stage3, 'Council'),
    annotations,
    metadata: message.metadata && typeof message.metadata === 'object' ? message.metadata : null,
    mode: message.mode === 'design' ? 'design' : 'text',
    loading: {
      stage1: false,
      stage2: false,
      stage3: false,
      annotations: false,
    },
  };
}

function normalizeConversation(conversation) {
  const messages = Array.isArray(conversation?.messages)
    ? conversation.messages
        .map((message) => {
          if (!message || typeof message !== 'object') {
            return null;
          }

          if (message.role === 'user') {
            return {
              role: 'user',
              content: typeof message.content === 'string' ? message.content : '',
              ...(message.image ? { image: message.image } : {}),
            };
          }

          if (message.role === 'assistant') {
            return normalizeAssistantMessage(message);
          }

          return null;
        })
        .filter(Boolean)
    : [];

  return {
    id: conversation?.id ?? null,
    created_at: conversation?.created_at ?? new Date().toISOString(),
    title: conversation?.title ?? 'New Conversation',
    messages,
  };
}

function friendlyErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (error instanceof TypeError) {
    return 'Cannot reach the backend. Make sure the server is running, then try again.';
  }

  return error?.message || fallback;
}

function App() {
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  // Prevents loadConversation from wiping the optimistic state we set during streaming
  const skipNextLoadRef = useRef(false);
  const currentConversationIdRef = useRef(null);

  useEffect(() => {
    getKeyStatus().then(({ openrouter }) => {
      if (!openrouter) setShowSetup(true);
    });
  }, []);

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  const updateLastAssistantMessage = useCallback((updater) => {
    setCurrentConversation((prev) => {
      if (!prev?.messages?.length) {
        return prev;
      }

      const lastAssistantIndex = [...prev.messages]
        .map((message, index) => ({ message, index }))
        .reverse()
        .find(({ message }) => message.role === 'assistant')?.index;

      if (lastAssistantIndex === undefined) {
        return prev;
      }

      const messages = [...prev.messages];
      const previousAssistant = messages[lastAssistantIndex];
      const nextAssistant = updater({
        ...previousAssistant,
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
          ...previousAssistant.loading,
        },
      });

      messages[lastAssistantIndex] = nextAssistant;
      return { ...prev, messages };
    });
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);

      const selectedId = currentConversationIdRef.current;
      if (selectedId && !convs.some((conversation) => conversation.id === selectedId)) {
        setCurrentConversationId(null);
        setCurrentConversation(null);
      }

    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }, []);

  const loadConversation = useCallback(async (id) => {
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false;
      return;
    }
    try {
      const conv = await api.getConversation(id);
      setCurrentConversation(normalizeConversation(conv));
    } catch (error) {
      console.error('Failed to load conversation:', error);
      setCurrentConversationId((selectedId) => (selectedId === id ? null : selectedId));
      setCurrentConversation(null);
      loadConversations();
    }
  }, [loadConversations]);

  // Load conversations on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConversations();
  }, [loadConversations]);

  // Load conversation details when selected
  useEffect(() => {
    if (currentConversationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadConversation(currentConversationId);
    }
  }, [currentConversationId, loadConversation]);

  const handleNewConversation = async () => {
    setErrorMessage('');
    try {
      const newConv = await api.createConversation();
      setConversations([
        { id: newConv.id, created_at: newConv.created_at, message_count: 0 },
        ...conversations,
      ]);
      setCurrentConversationId(newConv.id);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSelectConversation = (id) => {
    setErrorMessage('');
    setCurrentConversationId(id);
  };

  const handleDeleteConversation = async (id) => {
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setErrorMessage('');
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setCurrentConversation(null);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleResetAll = async () => {
    const confirmed = window.confirm(
      'Delete all local conversations and saved answers? This cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.resetAppData();
      skipNextLoadRef.current = false;
      setConversations([]);
      setCurrentConversationId(null);
      setCurrentConversation(null);
      setIsLoading(false);
      setErrorMessage('');
    } catch (error) {
      console.error('Failed to reset app data:', error);
    }
  };

  const handleSendMessage = async (content, image = null) => {
    setErrorMessage('');
    // If no conversation exists yet, create one first then send
    let convId = currentConversationId;
    let baseConversation = currentConversation;
    if (!convId) {
      try {
        const newConv = await api.createConversation();
        convId = newConv.id;
        baseConversation = newConv; // capture locally — don't rely on state flush
        setConversations((prev) => [
          { id: newConv.id, created_at: newConv.created_at, title: 'New Conversation', message_count: 0, mode: 'text' },
          ...prev,
        ]);
        // Skip the next loadConversation triggered by setCurrentConversationId
        // so it doesn't wipe the optimistic state we're about to set below.
        skipNextLoadRef.current = true;
        setCurrentConversationId(convId);
      } catch (error) {
        console.error('Failed to create conversation:', error);
        setErrorMessage(friendlyErrorMessage(error, 'Failed to create a conversation.'));
        return false;
      }
    }

    setIsLoading(true);
    let streamFinished = false;
    let streamErrored = false;
    try {
      // Build the full optimistic state in ONE call so we never read prev when
      // it might still be null (React batching race when auto-creating a convo).
      const userMessage = { role: 'user', content };
      if (image) userMessage.image = image;

      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        annotations: null,
        metadata: null,
        mode: image ? 'design' : 'text',
        loading: { stage1: false, stage2: false, stage3: false, annotations: false },
      };

      const optimisticConv = {
        ...(baseConversation ?? { id: convId, title: 'New Conversation', created_at: new Date().toISOString(), messages: [] }),
        messages: [...(baseConversation?.messages ?? []), userMessage, assistantMessage],
      };
      setCurrentConversation(optimisticConv);

      // Send message with streaming
      await api.sendMessageStream(convId, content, image, (eventType, event) => {
        switch (eventType) {
          case 'stage1_start':
            updateLastAssistantMessage((assistantMessage) => ({
              ...assistantMessage,
              loading: { ...assistantMessage.loading, stage1: true },
            }));
            break;

          case 'stage1_complete':
            updateLastAssistantMessage((assistantMessage) => ({
              ...assistantMessage,
              stage1: Array.isArray(event.data) ? event.data : null,
              loading: { ...assistantMessage.loading, stage1: false },
            }));
            break;

          case 'stage2_start':
            updateLastAssistantMessage((assistantMessage) => ({
              ...assistantMessage,
              loading: { ...assistantMessage.loading, stage2: true },
            }));
            break;

          case 'stage2_complete':
            updateLastAssistantMessage((assistantMessage) => ({
              ...assistantMessage,
              stage2: Array.isArray(event.data) ? event.data : null,
              metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : null,
              loading: { ...assistantMessage.loading, stage2: false },
            }));
            break;

          case 'stage3_start':
            updateLastAssistantMessage((assistantMessage) => ({
              ...assistantMessage,
              loading: { ...assistantMessage.loading, stage3: true },
            }));
            break;

          case 'stage3_complete':
            updateLastAssistantMessage((assistantMessage) => ({
              ...assistantMessage,
              stage3: normalizeStageResponse(event.data, 'Council'),
              loading: { ...assistantMessage.loading, stage3: false },
            }));
            break;

          case 'annotations_start':
            updateLastAssistantMessage((assistantMessage) => ({
              ...assistantMessage,
              loading: { ...assistantMessage.loading, annotations: true },
            }));
            break;

          case 'annotations_complete':
            updateLastAssistantMessage((assistantMessage) => ({
              ...assistantMessage,
              annotations: Array.isArray(event.data) ? event.data : [],
              loading: { ...assistantMessage.loading, annotations: false },
            }));
            break;

          case 'title_complete':
            // Reload conversations to get updated title
            loadConversations();
            break;

          case 'complete':
            streamFinished = true;
            // Stream complete, reload conversations list and refresh conversation
            loadConversations();
            skipNextLoadRef.current = false;
            loadConversation(convId);
            setIsLoading(false);
            break;

          case 'error':
            streamFinished = true;
            streamErrored = true;
            console.error('Stream error:', event.message);
            skipNextLoadRef.current = false;
            updateLastAssistantMessage((assistantMessage) => ({
              ...assistantMessage,
              loading: { stage1: false, stage2: false, stage3: false, annotations: false },
            }));
            setErrorMessage(event.message || 'The council could not finish this request.');
            loadConversations();
            loadConversation(convId);
            setIsLoading(false);
            break;

          default:
            console.log('Unknown event type:', eventType);
        }
      });

      if (!streamFinished) {
        skipNextLoadRef.current = false;
        setIsLoading(false);
        loadConversations();
        loadConversation(convId);
      }

      return !streamErrored;
    } catch (error) {
      console.error('Failed to send message:', error);
      setErrorMessage(friendlyErrorMessage(error, 'Failed to send message.'));
      // Remove optimistic messages on error
      setCurrentConversation((prev) => {
        if (!prev?.messages) {
          return prev;
        }
        return {
          ...prev,
          messages: prev.messages.slice(0, -2),
        };
      });
      setIsLoading(false);
      return false;
    }
  };

  return (
    <div className="app">
      {/* Vertical dashed guide lines — 120px from each viewport edge, shown on every page */}
      <div className="viewport-guides" aria-hidden="true">
        <span className="viewport-guide viewport-guide--left" />
        <span className="viewport-guide viewport-guide--right" />
      </div>
      {showSetup && <SetupModal onClose={() => setShowSetup(false)} />}
      <Sidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          onResetAll={handleResetAll}
          onOpenSetup={() => setShowSetup(true)}
        />
      <ChatInterface
        conversation={currentConversation}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        errorMessage={errorMessage}
      />
    </div>
  );
}

export default App;
