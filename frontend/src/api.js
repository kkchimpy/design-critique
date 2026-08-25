/**
 * API client for the LLM Council backend.
 */

// In local dev, Vite proxies /api → http://localhost:8001 (see vite.config.js).
// API keys must never be forwarded to an arbitrary VITE_API_BASE host.
const API_BASE = import.meta.env.VITE_API_BASE || '';

function isLoopbackHost(hostname) {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
}

function isLocalApiTarget() {
  try {
    const target = API_BASE
      ? new URL(API_BASE, window.location.origin)
      : new URL(window.location.origin);
    return isLoopbackHost(target.hostname);
  } catch {
    return false;
  }
}

const LOCAL_API_TARGET = isLocalApiTarget();

let appToken = '';
let sessionPromise = null;

async function ensureAppToken() {
  if (!LOCAL_API_TARGET) {
    throw new Error('The council only supports a local backend. Remove VITE_API_BASE or point it to localhost.');
  }

  if (appToken) {
    return appToken;
  }

  if (!sessionPromise) {
    sessionPromise = (async () => {
      const response = await fetch(`${API_BASE}/api/session`);
      if (!response.ok) {
        throw new Error('Failed to start a local session. Is the backend running?');
      }
      const payload = await response.json();
      if (!payload?.token) {
        throw new Error('The local session response was empty.');
      }
      appToken = payload.token;
      return appToken;
    })();
  }

  try {
    return await sessionPromise;
  } catch (error) {
    sessionPromise = null;
    throw error;
  }
}

function clearAppToken() {
  appToken = '';
  sessionPromise = null;
}

async function responseError(response, fallback) {
  try {
    const responseCopy = response.clone();
    const payload = await responseCopy.json();
    if (payload?.detail) {
      return typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail);
    }
  } catch {
    // Fall through to text body.
  }

  try {
    const text = await response.text();
    if (text) return text;
  } catch {
    // Fall through to fallback.
  }

  return fallback;
}

function dispatchSseBlock(block, onEvent) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.replace(/^data:\s?/, ''))
    .join('\n');

  if (!data.trim()) {
    return;
  }

  try {
    const event = JSON.parse(data);
    onEvent(event.type, event);
  } catch (error) {
    console.error('Failed to parse SSE event:', error);
  }
}

/**
 * Build headers for every request, injecting stored API keys so the backend
 * can use the caller's own credentials instead of the server's env vars.
 */
function authHeaders(token, extra = {}, includeApiKey = false) {
  const headers = { 'Content-Type': 'application/json', 'X-App-Token': token, ...extra };
  const apiKey = sessionStorage.getItem('llm_council_openrouter_key');
  if (includeApiKey && apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  return headers;
}

async function requestOptions(method = 'GET', body) {
  const token = await ensureAppToken();
  return {
    method,
    headers: authHeaders(token),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

async function fetchWithSession(endpoint, options) {
  const response = await fetch(`${API_BASE}${endpoint}`, options);
  if (response.status !== 401) {
    return response;
  }

  clearAppToken();
  const retryToken = await ensureAppToken();
  const retryHeaders = { ...options.headers, 'X-App-Token': retryToken };
  return fetch(`${API_BASE}${endpoint}`, { ...options, headers: retryHeaders });
}

async function fetchJson(endpoint, init, fallback, readErrorBody = true) {
  const options = init || await requestOptions();
  const response = await fetchWithSession(endpoint, options);
  if (!response.ok) {
    throw new Error(readErrorBody ? await responseError(response, fallback) : fallback);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export const api = {
  /**
   * List all conversations.
   */
  async listConversations() {
    return fetchJson('/api/conversations', await requestOptions(), 'Failed to list conversations', false);
  },

  /**
   * Create a new conversation.
   */
  async createConversation() {
    return fetchJson('/api/conversations', await requestOptions('POST', {}), 'Failed to create conversation');
  },

  /**
   * Get a specific conversation.
   */
  async getConversation(conversationId) {
    return fetchJson(
      `/api/conversations/${conversationId}`,
      await requestOptions(),
      'Failed to get conversation',
      false
    );
  },

  /**
   * Delete a conversation permanently.
   */
  async deleteConversation(conversationId) {
    const response = await fetchWithSession(
      `/api/conversations/${conversationId}`,
      await requestOptions('DELETE')
    );
    if (!response.ok && response.status !== 404) {
      throw new Error('Failed to delete conversation');
    }
  },

  /**
   * Remove all saved conversations and generated artifacts.
   */
  async resetAppData() {
    return fetchJson('/api/reset', await requestOptions('POST'), 'Failed to reset app data', false);
  },

  /**
   * Send a message and receive streaming updates.
   * @param {string} conversationId - The conversation ID
   * @param {string} content - The message content
   * @param {string|null} image - Optional image data URL (design critique mode)
  * @param {function} onEvent - Callback function for each event: (eventType, data) => void
   * @returns {Promise<void>}
   */
  async sendMessageStream(conversationId, content, image, onEvent) {
    const response = await fetchWithSession(
      `/api/conversations/${conversationId}/message/stream`,
      {
        method: 'POST',
        headers: authHeaders(await ensureAppToken(), {}, true),
        body: JSON.stringify({ content, image: image || null }),
      },
    );

    if (!response.ok) {
      throw new Error(await responseError(response, 'Failed to send message'));
    }

    if (!response.body) {
      throw new Error('The server did not return a response stream.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        dispatchSseBlock(block, onEvent);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      dispatchSseBlock(buffer, onEvent);
    }
  },

  /**
   * Download a self-contained HTML file for the latest design verdict.
   */
  async exportVerdict(conversationId) {
    const response = await fetchWithSession(
      `/api/conversations/${conversationId}/export`,
      await requestOptions('POST'),
    );
    if (!response.ok) {
      throw new Error(await responseError(response, 'Failed to export verdict'));
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
    const filename = filenameMatch?.[1] || 'design-critique.html';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return filename;
  },

  /**
   * Publish the latest design verdict to the web gallery on Supabase.
   */
  async publishVerdict(conversationId) {
    const response = await fetchWithSession(
      `/api/conversations/${conversationId}/publish`,
      await requestOptions('POST'),
    );
    if (!response.ok) {
      throw new Error(await responseError(response, 'Failed to publish verdict to web'));
    }
    return await response.json();
  },
};
