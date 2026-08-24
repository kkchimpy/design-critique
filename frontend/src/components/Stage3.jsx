import MarkdownRenderer from './MarkdownRenderer';
import useExportVerdict from '../hooks/useExportVerdict';
import { displayModelName } from '../utils/modelNames';
import './Stage3.css';

export default function Stage3({ finalResponse, isDesign = false, conversationId }) {
  const { exportState, exportResult, exportError, exportVerdict } = useExportVerdict(conversationId);

  if (!finalResponse) {
    return null;
  }

  return (
    <div className="stage stage3">
      <h3 className="stage-title">Stage 3: Final Council Answer</h3>
      <div className="final-response">
        <div className="chairman-label">
          Chairman: {displayModelName(finalResponse.model, 'Council')}
        </div>
        <div className="final-text markdown-content">
          <MarkdownRenderer html={finalResponse.response_html} fallback={finalResponse.response || ''} />
        </div>

        {isDesign && (
          <div className="export-panel">
            <button
              type="button"
              className="export-button"
              onClick={exportVerdict}
              disabled={exportState === 'loading'}
            >
              {exportState === 'loading'
                ? 'Preparing download…'
                : exportState === 'done'
                ? 'Download again'
                : 'Download HTML verdict'}
            </button>

            {exportState === 'done' && exportResult && (
              <div className="export-success">
                <strong>Downloaded {exportResult}.</strong>
                <p className="export-hint">The file is self-contained and can be opened or shared without this app.</p>
              </div>
            )}

            {exportState === 'error' && (
              <div className="export-error">{exportError}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
