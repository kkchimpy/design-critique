import { useState, useEffect } from 'react';
import { clearKey, getKeyStatus, saveKey } from './setupKeys';
import './SetupModal.css';

export default function SetupModal({ onClose }) {
  const [apiKey, setApiKey] = useState('');
  const [apiKeySet, setApiKeySet] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getKeyStatus().then(({ openrouter }) => {
      setApiKeySet(openrouter);
    });
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim() && !apiKeySet) {
      setError('An OpenRouter API key is required to run the council.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (apiKey.trim()) {
        saveKey(apiKey);
      }
      onClose();
    } catch {
      setError('Failed to save keys. Is the backend running?');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      clearKey();
      setApiKey('');
      setApiKeySet(false);
    } catch {
      setError('Failed to clear keys.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="setup-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <div className="setup-header">
          <h2 id="setup-title" className="setup-title">Connect OpenRouter</h2>
          <p className="setup-subtitle">
            Your key stays in this browser and is sent only to your local council server.
          </p>
        </div>

        <div className="setup-fields">
          <label className="setup-label" htmlFor="setup-api-key">
            OpenRouter API key <span className="setup-required">required</span>
          </label>
          <p className="setup-hint">
            Create one at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>.
          </p>
          <ol className="setup-steps" aria-label="How to use an OpenRouter API key">
            <li>Add credits or enable a limit in your OpenRouter account.</li>
            <li>Paste the key below. It is not written to this repository.</li>
          </ol>
          <div className="setup-input-wrap">
            <input
              id="setup-api-key"
              className="setup-input"
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setError(''); }}
              placeholder={apiKeySet ? '••••••••••• (set — leave blank to keep)' : 'sk-or-v1-...'}
              autoFocus
              autoComplete="current-password"
            />
            <button
              type="button"
              className="setup-toggle"
              onClick={() => setShowApiKey((v) => !v)}
              aria-label={showApiKey ? 'Hide key' : 'Show key'}
            >
              {showApiKey ? '🙈' : '👁'}
            </button>
          </div>

          {error && <p className="setup-error">{error}</p>}
        </div>

        <div className="setup-actions">
          <button type="button" className="setup-clear" onClick={handleClear} disabled={saving}>
            Clear saved keys
          </button>
          <div className="setup-actions-right">
            {apiKeySet && (
              <button type="button" className="setup-cancel" onClick={onClose} disabled={saving}>
                Cancel
              </button>
            )}
            <button type="button" className="setup-save" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save & continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
