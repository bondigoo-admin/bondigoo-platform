import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Check, X, Send, Trash2, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import Draggable from 'react-draggable';
import { logger } from '../utils/logger';
import useSocket from '../hooks/useSocket';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Textarea } from './ui/textarea.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';

const QAPanel = ({ sessionId, onClose, isCoach, userId }) => {
  const { t } = useTranslation();
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState('');
  const nodeRef = useRef(null);
  const token = localStorage.getItem('token') || '';
  const { socket, isConnected, connectionError } = useSocket(userId, sessionId, token);

  useEffect(() => {
    logger.info('[QAPanel] Initializing panel', { sessionId, isCoach, userId });
  }, [sessionId, isCoach, userId]);

  useEffect(() => {
    const fetchQuestions = async () => {
      if (!sessionId) return;
      try {
        const response = await axios.get(`/api/sessions/${sessionId}/qa`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setQuestions(response.data.questions || []);
        logger.info('[QAPanel] Questions fetched', { sessionId, count: response.data.questions?.length });
      } catch (error) {
        logger.error('[QAPanel] Fetch questions error', { error: error.message, sessionId });
        toast.error(t('qaPanel.fetchError'));
      }
    };
    fetchQuestions();
  }, [sessionId, token, t]);

  useEffect(() => {
    if (!socket || !isConnected) {
      if (connectionError) {
        logger.error('[QAPanel] Socket connection error, cannot set up listeners.', { connectionError, sessionId });
      } else {
        logger.warn('[QAPanel] Socket not connected, listeners not active.', { sessionId });
      }
      return;
    }

    logger.info('[QAPanel] Setting up socket listeners.', { sessionId });

    const qaSubmittedHandler = (qa) => {
      setQuestions(prev => {
        if (prev.some(q => q._id === qa._id)) return prev;
        logger.info('[QAPanel] Adding submitted QA via socket', { qa });
        return [...prev, qa];
      });
    };
    const qaUpdatedHandler = (updatedQa) => {
      setQuestions(prev => prev.map(q => q._id === updatedQa._id ? { ...updatedQa } : q));
      logger.info('[QAPanel] QA updated via socket', { qaId: updatedQa._id, hasAnswer: !!updatedQa.answer });
    };
    
    const qaDeletedHandler = ({ qaId }) => {
      setQuestions(prev => prev.filter(q => q._id !== qaId));
      logger.info('[QAPanel] QA deleted via socket', { qaId });
    };

    socket.on('qa-submitted', qaSubmittedHandler);
    socket.on('qa-updated', qaUpdatedHandler);
    socket.on('qa-deleted', qaDeletedHandler);

    return () => {
      socket.off('qa-submitted', qaSubmittedHandler);
      socket.off('qa-updated', qaUpdatedHandler);
      socket.off('qa-deleted', qaDeletedHandler);
    };
  }, [socket, isConnected, sessionId, connectionError]);

  const handleSubmitQuestion = async () => {
    if (!newQuestion.trim() || !sessionId) return;
    try {
      logger.info('[QAPanel] Submitting question (API Call)', { sessionId });
      await axios.post(`/api/sessions/${sessionId}/qa`, { question: newQuestion }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNewQuestion('');
      logger.info('[QAPanel] Submit question request successful', { sessionId });
      toast.success(t('qaPanel.submitSuccess'));
    } catch (error) {
      logger.error('[QAPanel] Submit question error', { error: error.message, sessionId });
      toast.error(t('qaPanel.submitError'));
    }
  };

  const handleModerate = async (qaId, approved) => {
    if (!isCoach || !sessionId) return;
    try {
      logger.info('[QAPanel] Moderating question (API Call)', { sessionId, qaId, approved });
      await axios.put(`/api/sessions/${sessionId}/qa/${qaId}`, { approved }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      logger.info('[QAPanel] Moderate question request successful', { sessionId, qaId });
    } catch (error) {
      logger.error('[QAPanel] Moderate question error', { error: error.message, sessionId, qaId });
      toast.error(t('qaPanel.moderateError'));
    }
  };

  const handleDeleteQA = async (qaId) => {
    if (!isCoach || !sessionId) return;
    if (!window.confirm(t('qaPanel.confirmDelete'))) return;
    try {
      logger.info('[QAPanel] Deleting QA (API Call)', { sessionId, qaId });
      await axios.delete(`/api/sessions/${sessionId}/qa/${qaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      logger.info('[QAPanel] Delete QA request successful', { sessionId, qaId });
      toast.success(t('qaPanel.deleteSuccess'));
    } catch (error) {
      logger.error('[QAPanel] Delete QA error', { error: error.message, sessionId, qaId });
      toast.error(t('qaPanel.deleteError'));
    }
  };

  const handleAnswerQuestion = async (qaId, answer) => {
    if (!sessionId) return;
    try {
      logger.info('[QAPanel] Submitting answer', { sessionId, qaId, userId, isCoach });
      await axios.put(`/api/sessions/${sessionId}/qa/${qaId}`, { answer }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setQuestions(prev => prev.map(q => q._id === qaId ? { ...q, answer } : q));
      logger.info('[QAPanel] Answer submitted successfully', { sessionId, qaId });
      toast.success(t('qaPanel.answerSuccess'));
    } catch (error) {
      logger.error('[QAPanel] Answer submission error', { error: error.message, sessionId, qaId });
      toast.error(t('qaPanel.answerError'));
    }
  };

  let displayedQuestions = [];
  if (isCoach) {
    displayedQuestions = [...questions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else {
    displayedQuestions = questions
      .filter(q => q.approved)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  return (
    <Draggable nodeRef={nodeRef} handle=".drag-handle" bounds="parent">
      <TooltipProvider>
        <Card ref={nodeRef} className="w-80 absolute z-50 pointer-events-auto flex flex-col">
          <CardHeader className="drag-handle flex flex-row items-center justify-between space-y-0 p-4 cursor-move">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5" /> {t('session.qa')}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('close')}>
              <X className="h-5 w-5" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-0 flex flex-col min-h-[150px] max-h-[60vh]">
            <div className="mb-4 flex-shrink-0 space-y-2">
              <Textarea
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder={t('session.askQuestion')}
                className="resize-none"
                rows={3}
                aria-label={t('session.askQuestion')}
                maxLength={280}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleSubmitQuestion}
                    className="w-full"
                    disabled={!newQuestion.trim()}
                    aria-label={t('session.submitQuestion')}
                  >
                    <Send className="h-4 w-4 mr-2" /> {t('session.submit')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('session.submitQuestion')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="space-y-3 overflow-y-auto flex-grow pr-2">
              {displayedQuestions.length > 0 ? (
                displayedQuestions.map((qa) => (
                  <div
                    key={qa._id}
                    className={`p-3 rounded-lg border ${isCoach && !qa.approved ? 'bg-amber-900/50 border-amber-700' : 'bg-background'} group relative`}
                  >
                    <p className="text-sm break-words mb-2">{qa.question}</p>
                    {qa.answer && (
                      <p className="text-xs text-muted-foreground italic border-t border-border pt-2 mt-2"><strong>{t('qaPanel.answer')}:</strong> {qa.answer}</p>
                    )}
                    <div className="flex flex-col gap-2 mt-2">
                      {!qa.answer && (
                        <Textarea
                          placeholder={t('qaPanel.answerPlaceholder')}
                          onBlur={(e) => {
                            if (e.target.value.trim()) {
                              handleAnswerQuestion(qa._id, e.target.value.trim());
                            }
                          }}
                          className="text-sm resize-none"
                          rows={2}
                          maxLength={280}
                        />
                      )}
                      {isCoach && (
                        <div className="flex items-center justify-end gap-1">
                          {!qa.approved && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  onClick={() => handleModerate(qa._id, true)}
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 h-8 px-2"
                                  aria-label={t('session.approve')}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>{t('session.approve')}</p></TooltipContent>
                            </Tooltip>
                          )}
                           <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteQA(qa._id)}
                                  className="text-destructive hover:text-destructive h-8 w-8 opacity-50 group-hover:opacity-100 transition-opacity"
                                  aria-label={t('qaPanel.deleteQuestion')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>{t('qaPanel.deleteQuestion')}</p></TooltipContent>
                            </Tooltip>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground italic text-center py-6 flex flex-col items-center justify-center gap-2">
                  <MessageCircle className="h-6 w-6 opacity-50" />
                  <span>{t('qaPanel.noQuestions')}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>
    </Draggable>
  );
};

export default QAPanel;