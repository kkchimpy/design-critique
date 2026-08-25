import { useState } from 'react';
import { api } from '../api';

export default function usePublishVerdict(conversationId) {
  const [publishState, setPublishState] = useState('idle'); // 'idle' | 'loading' | 'done' | 'error'
  const [publishUrl, setPublishUrl] = useState('');
  const [publishError, setPublishError] = useState('');

  const publishVerdict = async () => {
    setPublishState('loading');
    setPublishError('');
    try {
      const res = await api.publishVerdict(conversationId);
      setPublishUrl(res.url);
      setPublishState('done');
    } catch (error) {
      setPublishError(error.message || 'Failed to publish verdict to web');
      setPublishState('error');
    }
  };

  return {
    publishState,
    publishUrl,
    publishError,
    publishVerdict,
  };
}
