import { useState } from 'react';
import { api } from '../api';

export default function useExportVerdict(conversationId) {
  const [exportState, setExportState] = useState('idle');
  const [exportResult, setExportResult] = useState('');
  const [exportError, setExportError] = useState('');

  const exportVerdict = async () => {
    setExportState('loading');
    setExportError('');
    try {
      const filename = await api.exportVerdict(conversationId);
      setExportResult(filename);
      setExportState('done');
    } catch (error) {
      setExportError(error.message || 'Failed to export verdict');
      setExportState('error');
    }
  };

  return {
    exportState,
    exportResult,
    exportError,
    exportVerdict,
  };
}