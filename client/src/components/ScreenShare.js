import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import { Share, XCircle } from 'lucide-react';
import { Tooltip } from 'react-tooltip';

const ScreenShare = ({ shareScreen, isScreenSharing }) => {
  const { t } = useTranslation();
  const [error, setError] = useState(null);
  const [shareOptions, setShareOptions] = useState([]);

  useEffect(() => {
    // Simulate fetching available display surfaces (not directly supported yet, but future-proofing)
    const options = [
      { id: 'screen', label: t('screenShare.entireScreen') },
      { id: 'window', label: t('screenShare.window') },
      { id: 'tab', label: t('screenShare.tab') },
    ];
    setShareOptions(options);
  }, [t]);

  const handleScreenShare = async () => {
    try {
      const success = await shareScreen();
      if (!success) throw new Error('Screen sharing failed');
      setError(null);
    } catch (err) {
      setError(t('screenShare.error', { message: err.message }));
    }
  };

  return (
    <div className="flex flex-col items-center relative">
      {!isScreenSharing ? (
        <button
          onClick={handleScreenShare}
          className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          data-tooltip-id="screen-share-tooltip"
          data-tooltip-content={t('screenShare.start')}
        >
          <Share size={20} />
        </button>
      ) : (
        <button
          onClick={handleScreenShare}
          className="p-2 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center gap-2"
          data-tooltip-id="screen-share-tooltip"
          data-tooltip-content={t('screenShare.stop')}
        >
          <XCircle size={20} />
          <span className="text-sm">{t('screenShare.stop')}</span>
        </button>
      )}
      {isScreenSharing && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
      )}
      {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}
      <Tooltip id="screen-share-tooltip" place="top" />
    </div>
  );
};

ScreenShare.propTypes = {
  shareScreen: PropTypes.func.isRequired,
  isScreenSharing: PropTypes.bool.isRequired,
};

export default ScreenShare;