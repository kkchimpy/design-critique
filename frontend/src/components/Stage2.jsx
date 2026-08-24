import { useState } from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import { displayModelName } from '../utils/modelNames';
import './Stage2.css';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deAnonymizeText(text, labelToModel) {
  if (!labelToModel) return text;

  let result = text;
  // Replace each "Response X" with the actual model name
  Object.entries(labelToModel).forEach(([label, model]) => {
    result = result.replace(new RegExp(escapeRegExp(label), 'g'), `**${displayModelName(model)}**`);
  });
  return result;
}

export default function Stage2({ rankings, labelToModel, aggregateRankings }) {
  const [activeTab, setActiveTab] = useState(0);
  const safeRankings = Array.isArray(rankings) ? rankings : [];
  const safeActiveTab = Math.min(activeTab, Math.max(safeRankings.length - 1, 0));
  const activeRanking = safeRankings[safeActiveTab];

  if (safeRankings.length === 0) {
    return null;
  }

  return (
    <div className="stage stage2">
      <h3 className="stage-title">Stage 2: Peer Rankings</h3>

      <h4>Raw Evaluations</h4>
      <p className="stage-description">
        Each model evaluated all responses (anonymized as Response A, B, C, etc.) and provided rankings.
        Below, model names are shown in <strong>bold</strong> for readability, but the original evaluation used anonymous labels.
      </p>

      <div className="tabs">
        {safeRankings.map((rank, index) => (
          <button
            key={index}
            className={`tab ${safeActiveTab === index ? 'active' : ''}`}
            onClick={() => setActiveTab(index)}
          >
            {displayModelName(rank.model, `Model ${index + 1}`)}
          </button>
        ))}
      </div>

      <div className="tab-content">
        <div className="ranking-content markdown-content">
          <MarkdownRenderer
            html={activeRanking?.ranking_html}
            fallback={deAnonymizeText(activeRanking?.ranking || '', labelToModel)}
          />
        </div>

        {activeRanking?.parsed_ranking &&
         activeRanking.parsed_ranking.length > 0 && (
          <div className="parsed-ranking">
            <strong>Extracted Ranking:</strong>
            <ol>
              {activeRanking.parsed_ranking.map((label, i) => (
                <li key={i}>
                  {labelToModel && labelToModel[label]
                    ? displayModelName(labelToModel[label])
                    : label}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {Array.isArray(aggregateRankings) && aggregateRankings.length > 0 && (
        <div className="aggregate-rankings">
          <h4>Aggregate Rankings (Street Cred)</h4>
          <p className="stage-description">
            Combined results across all peer evaluations (lower score is better):
          </p>
          <div className="aggregate-list">
            {aggregateRankings.map((agg, index) => (
              <div key={index} className="aggregate-item">
                <span className="rank-position">#{index + 1}</span>
                <span className="rank-model">
                  {displayModelName(agg.model, `Model ${index + 1}`)}
                </span>
                <span className="rank-score">
                  Avg: {Number.isFinite(agg.average_rank) ? agg.average_rank.toFixed(2) : '-'}
                </span>
                <span className="rank-count">
                  ({agg.rankings_count} votes)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
