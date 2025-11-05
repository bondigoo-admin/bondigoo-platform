import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { Loader2, AlertTriangle } from 'lucide-react';
import ConversationItem from './ConversationItem';
import { useConversations } from '../../hooks/useConversations';
import { logger } from '../../utils/logger';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

logger.info('[ConversationList] Component initialized', {
  timestamp: new Date().toISOString(),
});

const ConversationList = ({ onInitiateConversationChange, activeConversationId }) => {
  const { conversations: fetchedConversations, isLoading, error, isFetching } = useConversations();
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?._id;

  useEffect(() => {
    logger.info('[ConversationList] Rendering with data', {
      count: fetchedConversations.length,
      isLoading,
      isFetching,
      activeConversationId,
      timestamp: new Date().toISOString(),
    });
  }, [fetchedConversations, isLoading, isFetching, activeConversationId]);

  const handleConversationSelect = (conversationId) => {
    if (!conversationId) {
      logger.error('[ConversationList] handleConversationSelect failed - No conversationId provided', {
        timestamp: new Date().toISOString(),
      });
      return;
    }

    logger.info('[ConversationList] Initiating conversation change', {
      conversationId,
      timestamp: new Date().toISOString(),
    });
    onInitiateConversationChange(conversationId);
  };

const renderContent = () => {
    if (isLoading) {
      logger.info('[ConversationList] Rendering loading state');
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>{t('messaging:loadingConversations')}</span>
        </div>
      );
    }
  
    if (error) {
      logger.error('[ConversationList] Rendering error state', { error: error.message });
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center text-sm text-red-600 dark:text-red-500">
          <AlertTriangle className="w-5 h-5" />
          <span>{t('messaging:errorLoadingConversations')}</span>
        </div>
      );
    }
  
    if (!fetchedConversations || fetchedConversations.length === 0) {
      logger.info('[ConversationList] Rendering empty state');
      return (
        <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">
          <span>{t('messaging:noConversationsYet')}</span>
        </div>
      );
    }
    
    logger.info('[ConversationList] Rendering conversation list', { count: fetchedConversations.length });
  
    return fetchedConversations.map(conv => (
      <ConversationItem
        key={conv._id}
        conversation={conv}
        isSelected={conv._id === activeConversationId}
        onClick={() => handleConversationSelect(conv._id)}
      />
    ));
};

  return (
    <div className="flex flex-col h-full overflow-y-auto relative bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800">
      {renderContent()}
      {isFetching && !isLoading && (
        <div className="absolute bottom-2 right-2 opacity-50" aria-hidden="true">
          <Loader2 className="w-3 h-3 animate-spin text-gray-500 dark:text-gray-400" />
        </div>
      )}
    </div>
  );
};

ConversationList.propTypes = {
  onInitiateConversationChange: PropTypes.func.isRequired,
  activeConversationId: PropTypes.string,
};

export default ConversationList;