import React, { useState, useEffect } from 'react';
import { FileText, BarChart, ChevronDown, ChevronUp, Share } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { logger } from '../utils/logger';

import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible.jsx';
import { Input } from './ui/input.tsx';
import { Label } from './ui/label.tsx';
import { Textarea } from './ui/textarea.tsx';

const CoachControlsPanel = ({ sessionId, onCreatePoll, onShareResource }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [agenda, setAgenda] = useState([]);
  const [newAgendaItem, setNewAgendaItem] = useState('');

  useEffect(() => {
    logger.info('[CoachControlsPanel] Component mounted', { sessionId });
    return () => logger.info('[CoachControlsPanel] Component unmounted', { sessionId });
  }, [sessionId]);

  const handleNotesChange = (e) => {
    const updatedNotes = e.target.value;
    setNotes(updatedNotes);
    logger.info('[CoachControlsPanel] Notes updated', { sessionId, notesLength: updatedNotes.length });
  };

  const handleAddAgendaItem = async () => {
    if (!newAgendaItem.trim()) {
      logger.warn('[CoachControlsPanel] Empty agenda item ignored', { sessionId });
      return;
    }
    const updatedAgenda = [...agenda, { text: newAgendaItem.trim(), timestamp: new Date().toISOString() }];
    setAgenda(updatedAgenda);
    setNewAgendaItem('');
    try {
      await axios.put(`/api/sessions/${sessionId}/notes-agenda`, { agenda: updatedAgenda }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      logger.info('[CoachControlsPanel] Agenda item added', { sessionId, agendaItem: newAgendaItem });
    } catch (error) {
      logger.error('[CoachControlsPanel] Failed to add agenda item', { error: error.message, sessionId });
    }
  };

  const handleCreatePoll = () => {
    const question = prompt(t('coachControls.pollQuestionPrompt'));
    const optionsInput = prompt(t('coachControls.pollOptionsPrompt'));
    if (question && optionsInput) {
      const options = optionsInput.split(',').map(opt => opt.trim());
      if (options.length < 2) {
        logger.warn('[CoachControlsPanel] Insufficient poll options', { sessionId, optionsLength: options.length });
        alert(t('coachControls.minOptionsError'));
        return;
      }
      onCreatePoll(question, options);
      logger.info('[CoachControlsPanel] Poll created', { sessionId, question, options });
    }
  };

  const handleShareResource = () => {
    const name = prompt(t('coachControls.resourceNamePrompt'));
    const url = prompt(t('coachControls.resourceUrlPrompt'));
    if (name && url) {
      const resource = { name, url };
      onShareResource(resource);
      logger.info('[CoachControlsPanel] Resource shared', { sessionId, resource });
    } else {
      logger.warn('[CoachControlsPanel] Resource sharing cancelled or incomplete', { sessionId });
    }
  };

  return (
    <div className="absolute w-80 md:w-96 z-30" role="region" aria-label={t('coachControls.title')}>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <Card className="border-border">
                <CardHeader className="p-0">
                    <div className="flex justify-between items-center p-3 bg-primary text-primary-foreground rounded-t-lg">
                        <CardTitle className="text-base font-medium">{t('coachControls.title')}</CardTitle>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground">
                                {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                <span className="sr-only">{isOpen ? t('coachControls.collapse') : t('coachControls.expand')}</span>
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                </CardHeader>
                <CollapsibleContent>
                    <CardContent className="p-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="session-notes" className="flex items-center gap-2">
                                <FileText size={16} /> {t('session.sessionNotes')}
                            </Label>
                            <Textarea
                                id="session-notes"
                                value={notes}
                                onChange={handleNotesChange}
                                placeholder={t('session.sessionNotes')}
                                className="w-full h-24 resize-none"
                                aria-label={t('session.sessionNotes')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="agenda-input" className="flex items-center gap-2">
                                <FileText size={16} /> {t('session.agenda')}
                            </Label>
                            <ul className="space-y-2 mb-2 max-h-32 overflow-y-auto">
                                {agenda.map((item, i) => (
                                    <li key={i} className="text-sm text-muted-foreground">
                                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {item.text}
                                    </li>
                                ))}
                            </ul>
                            <div className="flex gap-2">
                                <Input
                                    id="agenda-input"
                                    type="text"
                                    value={newAgendaItem}
                                    onChange={(e) => setNewAgendaItem(e.target.value)}
                                    placeholder={t('session.addAgendaItem')}
                                    aria-label={t('session.addAgendaItem')}
                                />
                                <Button
                                    onClick={handleAddAgendaItem}
                                    aria-label={t('session.add')}
                                    disabled={!newAgendaItem.trim()}
                                >
                                    {t('session.add')}
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Button
                                onClick={handleCreatePoll}
                                className="w-full"
                                variant="outline"
                                aria-label={t('session.createPoll')}
                            >
                                <BarChart size={16} className="mr-2" /> {t('session.createPoll')}
                            </Button>
                            <Button
                                onClick={handleShareResource}
                                className="w-full"
                                variant="outline"
                                aria-label={t('session.shareResource')}
                            >
                                <Share size={16} className="mr-2" /> {t('session.shareResource')}
                            </Button>
                        </div>
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    </div>
  );
};

export default CoachControlsPanel;