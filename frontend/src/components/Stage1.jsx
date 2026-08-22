import { useState } from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import { displayModelName } from '../utils/modelNames';
import './Stage1.css';

export default function Stage1({ responses }) {
  const [activeTab, setActiveTab] = useState(0);
  const safeResponses = Array.isArray(responses) ? responses : [];
  const safeActiveTab = Math.min(activeTab, Math.max(safeResponses.length - 1, 0));
  const activeResponse = safeResponses[safeActiveTab];

  if (safeResponses.length === 0) {
    return null;
  }

  return (
    <div className="stage stage1">
      <h3 className="stage-title">Stage 1: Individual Responses</h3>

      <div className="tabs">
        {safeResponses.map((resp, index) => (
          <button
            key={index}
            className={`tab ${safeActiveTab === index ? 'active' : ''}`}
            onClick={() => setActiveTab(index)}
          >
            {displayModelName(resp.model, `Model ${index + 1}`)}
          </button>
        ))}
      </div>

      <div className="tab-content">
        <div className="response-text markdown-content">
          <MarkdownRenderer>{activeResponse?.response || ''}</MarkdownRenderer>
        </div>
      </div>
    </div>
  );
}
