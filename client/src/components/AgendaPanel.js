import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar as CalendarIcon, X, CheckCircle, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import Draggable from 'react-draggable';
import { logger } from '../utils/logger';
import { useVideoSocket } from '../contexts/SocketContext';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.tsx';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { ScrollArea } from './ui/scroll-area.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';

const AgendaPanel = ({ sessionId, onClose, isCoach, userId }) => {
  const { t } = useTranslation();
  const [agenda, setAgenda] = useState([]);
  const [newAgendaItem, setNewAgendaItem] = useState('');
  const nodeRef = useRef(null);
  const token = localStorage.getItem('token') || '';
  const { socket, isConnected, connectionError } = useVideoSocket();

  useEffect(() => {
    logger.info('[AgendaPanel] Initializing panel', { sessionId, isCoach, userId });
  }, [sessionId, isCoach, userId]);

  useEffect(() => {
    const fetchAgenda = async () => {
      if (!sessionId) return;
      try {
        const response = await axios.get(`/api/sessions/${sessionId}/agenda`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAgenda(response.data.agenda || []);
        logger.info('[AgendaPanel] Agenda fetched', { sessionId });
      } catch (error) {
        logger.error('[AgendaPanel] Fetch agenda error', { error: error.message, sessionId });
        toast.error(t('agendaPanel.fetchError'));
      }
    };
    fetchAgenda();
  }, [sessionId, token, t]);

  useEffect(() => {
    if (!socket || !isConnected) {
      logger.warn('[AgendaPanel] Socket not ready', { sessionId, isConnected, connectionError });
      return;
    }
    logger.info('[AgendaPanel] Setting up socket listeners', { sessionId, socketId: socket.id });

    const agendaUpdateHandler = (updatedAgenda) => {
      setAgenda(updatedAgenda);
      logger.info('[AgendaPanel] Agenda updated via socket', { sessionId, itemCount: updatedAgenda.length });
    };

    socket.on('agenda-updated', agendaUpdateHandler);
    return () => {
      socket.off('agenda-updated', agendaUpdateHandler);
      logger.info('[AgendaPanel] Cleaned up socket listeners', { sessionId });
    };
  }, [socket, isConnected, sessionId, connectionError]);

  const handleAddAgendaItem = async () => {
    if (!isCoach || !newAgendaItem.trim() || !sessionId) return;
    const trimmedItem = newAgendaItem.trim();
    if (trimmedItem.length > 150) {
      toast.error(t('agendaPanel.itemTooLong'));
      return;
    }

    const newItem = { text: trimmedItem, timestamp: new Date().toISOString(), completed: false };
    const originalAgenda = [...agenda];
    const updatedAgenda = [...agenda, newItem];
    setAgenda(updatedAgenda);
    setNewAgendaItem('');
    logger.info('[AgendaPanel] Optimistically added agenda item', { sessionId, text: trimmedItem });

    try {
      await axios.put(
        `/api/sessions/${sessionId}/agenda`,
        { agenda: updatedAgenda },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      logger.info('[AgendaPanel] Agenda item added successfully', { sessionId });
    } catch (error) {
      setAgenda(originalAgenda);
      logger.error('[AgendaPanel] Add agenda item error', { error: error.message, sessionId });
      toast.error(t('agendaPanel.updateFailed'));
    }
  };

  const handleToggleAgendaItem = async (index) => {
    if (!isCoach || !sessionId || index < 0 || index >= agenda.length) return;
    const originalAgenda = [...agenda];
    const updatedAgenda = agenda.map((item, i) =>
      i === index ? { ...item, completed: !item.completed } : item
    );
    setAgenda(updatedAgenda);
    logger.info('[AgendaPanel] Optimistically toggled agenda item', { sessionId, index });

    try {
      await axios.put(
        `/api/sessions/${sessionId}/agenda`,
        { agenda: updatedAgenda },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      logger.info('[AgendaPanel] Agenda item toggled successfully', { sessionId });
    } catch (error) {
      setAgenda(originalAgenda);
      logger.error('[AgendaPanel] Toggle agenda item error', { error: error.message, sessionId });
      toast.error(t('agendaPanel.updateFailed'));
    }
  };

  const handleRemoveAgendaItem = async (index) => {
    if (!isCoach || !sessionId || index < 0 || index >= agenda.length) return;
    const originalAgenda = [...agenda];
    const updatedAgenda = agenda.filter((_, i) => i !== index);
    setAgenda(updatedAgenda);
    logger.info('[AgendaPanel] Optimistically removed agenda item', { sessionId, index });

    try {
      await axios.put(
        `/api/sessions/${sessionId}/agenda`,
        { agenda: updatedAgenda },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      logger.info('[AgendaPanel] Agenda item removed successfully', { sessionId });
    } catch (error) {
      setAgenda(originalAgenda);
      logger.error('[AgendaPanel] Remove agenda item error', { error: error.message, sessionId });
      toast.error(t('agendaPanel.updateFailed'));
    }
  };

  return (
    <Draggable nodeRef={nodeRef} handle=".drag-handle" bounds="parent">
      <Card ref={nodeRef} className="w-full max-w-sm md:w-80 absolute z-[1000] pointer-events-auto shadow-lg">
        <CardHeader className="drag-handle flex flex-row justify-between items-center p-4 cursor-move">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <CalendarIcon size={20} /> {t('session.agenda')}
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X size={20} />
                  <span className="sr-only">{t('close')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('close')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <ScrollArea className="h-auto max-h-[calc(80vh-180px)]">
            <ul className="space-y-2 pr-3">
              {agenda.length > 0 ? (
                agenda.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md text-sm group">
                    {isCoach && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleToggleAgendaItem(i)}
                              className={`p-1 rounded-full ${
                                item.completed ? 'bg-green-600 hover:bg-green-700' : 'bg-muted-foreground hover:bg-muted-foreground/80'
                              } text-white flex-shrink-0 transition-colors h-6 w-6 flex items-center justify-center`}
                            >
                              <CheckCircle size={14} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{item.completed ? t('agendaPanel.markIncomplete') : t('agendaPanel.markComplete')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {!isCoach && (
                      <span className={`p-1 rounded-full ${item.completed ? 'bg-green-500' : 'bg-muted-foreground'} flex-shrink-0 inline-block w-6 h-6 flex items-center justify-center`}>
                        <CheckCircle size={14} className="text-white" />
                      </span>
                    )}
                    <span className={`flex-1 break-words ${item.completed ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}>
                      {item.text}
                    </span>
                    {isCoach && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveAgendaItem(i)}
                              className="text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                            >
                              <Trash2 size={14} />
                              <span className="sr-only">{t('agendaPanel.remove')}</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('agendaPanel.remove')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </li>
                ))
              ) : (
                <p className="text-sm text-muted-foreground italic">{t('agendaPanel.noItems')}</p>
              )}
            </ul>
          </ScrollArea>
          {isCoach && (
            <div className="mt-4 pt-4 border-t border-border">
              <Input
                type="text"
                value={newAgendaItem}
                onChange={(e) => setNewAgendaItem(e.target.value)}
                placeholder={t('agendaPanel.addItem')}
                className="w-full mb-2 text-sm"
                onKeyPress={(e) => e.key === 'Enter' && newAgendaItem.trim() && handleAddAgendaItem()}
                maxLength={150}
              />
              <Button
                onClick={handleAddAgendaItem}
                className="w-full text-sm"
                disabled={!newAgendaItem.trim()}
              >
                {t('session.add')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </Draggable>
  );
};

export default AgendaPanel;