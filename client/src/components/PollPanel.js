import React, { useState, useEffect, useRef } from 'react';
import { BarChart, X, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import Draggable from 'react-draggable';
import { logger } from '../utils/logger';
import { useVideoSocket } from '../contexts/SocketContext';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Input } from './ui/input.tsx';
import { Textarea } from './ui/textarea.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';
import { Progress } from './ui/progress.jsx';

const PollPanel = ({ sessionId, onClose, isCoach, userId }) => {
  const { t } = useTranslation();
  const [polls, setPolls] = useState([]);
  const [newPoll, setNewPoll] = useState({ type: 'multiple', question: '', options: ['', ''] });
  const nodeRef = useRef(null);
  const token = localStorage.getItem('token') || '';

  const { socket, isConnected: socketConnected, connectionError } = useVideoSocket();

  useEffect(() => {
    const fetchPolls = async () => {
      if (!sessionId) return;
      try {
        const response = await axios.get(`/api/sessions/${sessionId}/polls`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setPolls(response.data.polls || []);
        logger.info('[PollPanel] Polls fetched', { sessionId, count: response.data.polls?.length });
      } catch (error) {
        logger.error('[PollPanel] Fetch polls error', { error: error.message, sessionId });
        toast.error(t('pollPanel.fetchError'));
      }
    };
    fetchPolls();
  }, [sessionId, token, t]);

  useEffect(() => {
    if (!socket || !socketConnected) {
      if (connectionError) {
        logger.error('[PollPanel] Socket connection error, cannot set up listeners', { connectionError, sessionId });
      } else {
        logger.warn('[PollPanel] Socket not connected, listeners not active', { sessionId });
      }
      return;
    }
  
    logger.info('[PollPanel] Setting up socket listeners', { sessionId, socketId: socket.id });
  
    const pollCreatedHandler = (poll) => {
      setPolls(prev => {
        const tempIndex = prev.findIndex(
          p => p._id.startsWith('temp') && 
               p.question === poll.question && 
               JSON.stringify(p.options) === JSON.stringify(poll.options.map(o => ({ text: o.text, votes: o.votes || 0 })))
        );
        if (tempIndex !== -1) {
          const newPolls = [...prev];
          newPolls[tempIndex] = poll;
          logger.info('[PollPanel] Replaced optimistic poll with server poll', { sessionId, pollId: poll._id });
          return newPolls;
        }
        if (prev.some(p => p._id === poll._id)) {
          logger.warn('[PollPanel] Duplicate poll detected, skipping add', { sessionId, pollId: poll._id });
          return prev;
        }
        logger.info('[PollPanel] Poll created via socket', { sessionId, pollId: poll._id });
        return [...prev, poll];
      });
    };
  
    const pollVotedHandler = (updatedPoll) => {
      setPolls(prev => {
        const exists = prev.some(p => p._id === updatedPoll._id);
        if (!exists) {
          logger.warn('[PollPanel] Received vote for unknown poll, adding it', { sessionId, pollId: updatedPoll._id });
          return [...prev, updatedPoll];
        }
        logger.info('[PollPanel] Poll vote updated via socket', { sessionId, pollId: updatedPoll._id });
        return prev.map(p => (p._id === updatedPoll._id ? updatedPoll : p));
      });
    };
  
    const pollDeletedHandler = ({ pollId }) => {
      setPolls(prev => {
        if (!prev.some(p => p._id === pollId)) {
          logger.warn('[PollPanel] Attempted to delete unknown poll', { sessionId, pollId });
          return prev;
        }
        logger.info('[PollPanel] Poll deleted via socket', { sessionId, pollId });
        return prev.filter(p => p._id !== pollId);
      });
    };
  
    socket.on('poll-created', pollCreatedHandler);
    socket.on('poll-voted', pollVotedHandler);
    socket.on('poll-deleted', pollDeletedHandler);
  
    return () => {
      logger.info('[PollPanel] Cleaning up socket listeners', { sessionId, socketId: socket.id });
      socket.off('poll-created', pollCreatedHandler);
      socket.off('poll-voted', pollVotedHandler);
      socket.off('poll-deleted', pollDeletedHandler);
    };
  }, [socket, socketConnected, sessionId, connectionError, t]);

  const handleCreatePoll = async () => {
    const trimmedQuestion = newPoll.question.trim();
    const validOptions = newPoll.type === 'open' || newPoll.options.every(opt => opt.trim());
  
    if (!trimmedQuestion || !validOptions) {
      toast.error(t('pollPanel.validationError'));
      logger.warn('[PollPanel] Create poll validation failed', { newPoll });
      return;
    }
  
    const pollDataToSend = {
      type: newPoll.type,
      question: trimmedQuestion,
      options: newPoll.type === 'multiple' ? newPoll.options.map(opt => opt.trim()).filter(opt => opt) : undefined,
    };
  
    const tempPoll = {
      ...pollDataToSend,
      _id: `temp-${Date.now()}`,
      voters: [],
      options: pollDataToSend.options ? pollDataToSend.options.map(text => ({ text, votes: 0 })) : [],
      createdAt: new Date(),
    };
    setPolls(prev => [...prev, tempPoll]);
    logger.info('[PollPanel] Optimistically added poll to state', { sessionId, tempPollId: tempPoll._id });
  
    try {
      const response = await axios.post(`/api/sessions/${sessionId}/polls`, pollDataToSend, {
        headers: { Authorization: `Bearer ${token}` },
      });
      logger.info('[PollPanel] Create poll request successful', { sessionId, pollId: response.data.poll?._id });
      toast.success(t('pollPanel.createSuccess'));
      setNewPoll({ type: 'multiple', question: '', options: ['', ''] });
    } catch (error) {
      setPolls(prev => prev.filter(p => p._id !== tempPoll._id));
      logger.error('[PollPanel] Create poll error, rolled back optimistic update', { error: error.response?.data || error.message, sessionId });
      toast.error(error.response?.data?.message || t('pollPanel.createError'));
    }
  };

  const handleVote = async (pollId, optionIndex, textResponse = null) => {
    const poll = polls.find(p => p._id === pollId);
    if (poll?.voters?.includes(userId)) {
        toast.info(t('pollPanel.alreadyVoted'));
        return;
    }

    const payload = poll?.type === 'open' ? { text: textResponse } : { optionIndex };
    try {
      logger.info('[PollPanel] Submitting vote (API Call)', { sessionId, pollId, payload });
      await axios.put(`/api/sessions/${sessionId}/polls/${pollId}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      logger.info('[PollPanel] Vote submission successful', { sessionId, pollId });
    } catch (error) {
      logger.error('[PollPanel] Vote error', { error: error.message, sessionId, pollId });
       toast.error(t('pollPanel.voteError'));
    }
  };

   const handleDeletePoll = async (pollId) => {
     if (!isCoach || !sessionId) return;
     if (!window.confirm(t('pollPanel.confirmDelete'))) return;

     try {
       logger.info('[PollPanel] Deleting poll (API Call)', { sessionId, pollId });
       await axios.delete(`/api/sessions/${sessionId}/polls/${pollId}`, {
         headers: { Authorization: `Bearer ${token}` },
       });
       logger.info('[PollPanel] Delete poll request successful', { sessionId, pollId });
       toast.success(t('pollPanel.deleteSuccess'));
     } catch (error) {
       logger.error('[PollPanel] Delete poll error', { error: error.message, sessionId, pollId });
       toast.error(t('pollPanel.deleteError'));
     }
   };

  const handleOptionChange = (index, value) => {
    const newOptions = [...newPoll.options];
    newOptions[index] = value;
    setNewPoll({ ...newPoll, options: newOptions });
  };

  const addOption = () => {
    if (newPoll.options.length < 5) {
        setNewPoll({ ...newPoll, options: [...newPoll.options, ''] });
    } else {
        toast.info(t('pollPanel.maxOptions'));
    }
  };

  const removeOption = (index) => {
    if (newPoll.options.length > 2) {
        setNewPoll({ ...newPoll, options: newPoll.options.filter((_, i) => i !== index) });
    }
  };

  return (
    <Draggable nodeRef={nodeRef} handle=".drag-handle" bounds="parent">
      <TooltipProvider>
        <Card ref={nodeRef} className="w-80 absolute z-50 pointer-events-auto flex flex-col max-h-[80vh]">
          <CardHeader className="drag-handle flex flex-row items-center justify-between space-y-0 p-4 cursor-move">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart className="h-5 w-5" /> {t('session.polls')}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('close')}>
              <X className="h-5 w-5" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-0 overflow-y-auto">
            {isCoach && (
              <div className="border p-4 rounded-lg mb-6 space-y-3">
                <h4 className="text-md font-semibold">{t('pollPanel.createTitle')}</h4>
                <Select
                  value={newPoll.type}
                  onValueChange={(value) => setNewPoll({ ...newPoll, type: value, options: value === 'open' ? [''] : ['', ''] })}
                >
                  <SelectTrigger aria-label={t('session.pollType')}>
                    <SelectValue placeholder={t('session.pollType')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple">{t('session.multipleChoice')}</SelectItem>
                    <SelectItem value="open">{t('session.openText')}</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  value={newPoll.question}
                  onChange={(e) => setNewPoll({ ...newPoll, question: e.target.value })}
                  placeholder={t('session.pollQuestion')}
                  rows={2}
                  aria-label={t('session.pollQuestion')}
                  maxLength={150}
                  className="resize-none"
                />
                {newPoll.type === 'multiple' && (
                  <div className="space-y-2">
                    {newPoll.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          type="text"
                          value={opt}
                          onChange={(e) => handleOptionChange(i, e.target.value)}
                          placeholder={`${t('session.option')} ${i + 1}`}
                          aria-label={`${t('session.option')} ${i + 1}`}
                          maxLength={50}
                        />
                        {newPoll.options.length > 2 && (
                          <Button variant="ghost" size="icon" onClick={() => removeOption(i)} title={t('pollPanel.removeOption')} className="flex-shrink-0 h-9 w-9 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {newPoll.options.length < 5 && (
                      <Button variant="link" onClick={addOption} className="p-0 h-auto text-sm">
                        <Plus className="h-4 w-4 mr-1" /> {t('session.addOption')}
                      </Button>
                    )}
                  </div>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className='w-full'>
                      <Button
                        onClick={handleCreatePoll}
                        className="w-full"
                        disabled={!newPoll.question.trim() || (newPoll.type === 'multiple' && !newPoll.options.every(opt => opt.trim()))}
                      >
                        {t('session.create')}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('session.createPoll')}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
            <div className="space-y-4">
              {polls.length > 0 ? polls.map((poll) => {
                const hasVoted = poll.voters?.includes(userId);
                const totalVotes = poll.options?.reduce((sum, opt) => sum + (opt.votes || 0), 0) || 0;

                return (
                  <div key={poll._id} className="border p-4 rounded-lg relative group">
                    <h4 className="text-md font-semibold mb-2 break-words">{poll.question}</h4>
                    {poll.type === 'multiple' && poll.options && (
                      <ul className="space-y-2">
                        {poll.options.map((opt, i) => {
                          const currentVotes = Number(opt.votes) || 0;
                          const percentage = totalVotes > 0 ? ((currentVotes / totalVotes) * 100) : 0;
                          return (
                            <li key={i}>
                              <button
                                onClick={() => handleVote(poll._id, i)}
                                className={`w-full text-left p-2 rounded-md border transition-colors ${hasVoted ? 'bg-muted border-border cursor-default' : 'border-border hover:bg-accent hover:text-accent-foreground'}`}
                                disabled={hasVoted}
                                aria-label={`${t('session.vote')} ${opt.text}`}
                              >
                                <div className="flex justify-between items-center">
                                  <span className="text-card-foreground break-words mr-2">{opt.text}</span>
                                  {(hasVoted || isCoach) && <span className="text-xs text-primary font-semibold">{currentVotes} ({percentage.toFixed(0)}%)</span>}
                                </div>
                                {(hasVoted || isCoach) && (
                                  <Progress value={percentage} className="h-1.5 mt-2" />
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {poll.type === 'open' && (
                      <div>
                        {isCoach ? (
                          <div className="text-sm text-muted-foreground italic">({t('pollPanel.openResponsesNotDisplayed')})</div>
                        ) : (
                          <Textarea
                            onBlur={(e) => {
                              const value = e.target.value.trim();
                              if (value && !hasVoted) {
                                handleVote(poll._id, 0, value);
                              }
                            }}
                            placeholder={hasVoted ? t('pollPanel.alreadyVoted') : t('session.yourResponse')}
                            className={`w-full resize-none ${hasVoted ? 'cursor-not-allowed opacity-70' : ''}`}
                            rows={2}
                            disabled={hasVoted}
                            aria-label={t('session.yourResponse')}
                            maxLength={200}
                          />
                        )}
                      </div>
                    )}
                    {isCoach && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeletePoll(poll._id)}
                        className="absolute top-1 right-1 h-8 w-8 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        title={t('pollPanel.deletePoll')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              }) : <p className="text-sm text-muted-foreground italic text-center">{t('pollPanel.noPolls')}</p>}
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>
    </Draggable>
  );
};

export default PollPanel;