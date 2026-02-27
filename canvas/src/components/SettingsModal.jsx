import { useState } from 'react';
import { useStore } from '../lib/store';

export default function SettingsModal({ onClose }) {
  const { llmConfig, setLlmConfig } = useStore();
  const [apiKey, setApiKey] = useState(llmConfig.apiKey);
  const [baseUrl, setBaseUrl] = useState(llmConfig.baseUrl);
  const [model, setModel] = useState(llmConfig.model);

  const handleSave = () => {
    setLlmConfig({ apiKey, baseUrl, model });
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>LLM Settings</h2>
          <button className="icon-btn modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <label className="modal-label">
            API Key
            <input
              type="password"
              className="modal-input"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoFocus
            />
          </label>
          <label className="modal-label">
            Base URL
            <input
              className="modal-input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </label>
          <label className="modal-label">
            Model
            <input
              className="modal-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </label>
          <div className="modal-hints">
            <p>Works with any OpenAI-compatible API:</p>
            <ul>
              <li>
                <strong>OpenAI:</strong> https://api.openai.com/v1 · gpt-4o
              </li>
              <li>
                <strong>Gemini:</strong>{' '}
                https://generativelanguage.googleapis.com/v1beta/openai ·
                gemini-2.0-flash
              </li>
              <li>
                <strong>Ollama:</strong> http://localhost:11434/v1 · llama3.2
              </li>
            </ul>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
