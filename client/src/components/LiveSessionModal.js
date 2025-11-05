import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Clock, MessageSquareText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog.tsx';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Label } from './ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';

const FormField = ({ id, icon, label, children }) => (
    <div className="grid gap-2">
        <Label htmlFor={id} className="flex items-center text-muted-foreground">
            {icon}
            <span className="ml-2">{label}</span>
        </Label>
        {children}
    </div>
);

const LiveSessionModal = ({ isOpen, onClose, coachId }) => {
  const { t } = useTranslation(['common', 'coachprofile']);
  const [sessionDetails, setSessionDetails] = useState({
    duration: '30',
    topic: '',
    communicationMethod: 'video'
  });

  const handleStartSession = (e) => {
    e.preventDefault();
    // Here you would call the backend API with sessionDetails
    console.log("Starting session with details:", { ...sessionDetails, coachId });
    toast.success(t('coachprofile:sessionRequested'));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-md p-0">
            <motion.div
              initial={{ y: 25, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <DialogHeader className="p-6 pb-4">
                <DialogTitle className="text-xl font-bold">{t('coachprofile:requestLiveSession')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleStartSession}>
                <div className="px-6 pb-6 grid gap-6">
                  <FormField id="duration" icon={<Clock size={16} />} label={t('coachprofile:sessionDuration', 'Sitzungsdauer')}>
                    <Select
                      name="duration"
                      value={sessionDetails.duration}
                      onValueChange={(value) => setSessionDetails(p => ({...p, duration: value}))}
                    >
                      <SelectTrigger id="duration">
                        <SelectValue placeholder={t('coachprofile:selectDuration', 'Select duration')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 {t('coachprofile:minutes', 'Minuten')}</SelectItem>
                        <SelectItem value="45">45 {t('coachprofile:minutes', 'Minuten')}</SelectItem>
                        <SelectItem value="60">60 {t('coachprofile:minutes', 'Minuten')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField id="topic" icon={<MessageSquareText size={16} />} label={t('coachprofile:sessionTopic', 'Sitzungsthema')}>
                    <Input
                      id="topic"
                      name="topic"
                      value={sessionDetails.topic}
                      onChange={(e) => setSessionDetails(p => ({...p, topic: e.target.value}))}
                      placeholder={t('coachprofile:topicPlaceholder', 'e.g., Career advice')}
                    />
                  </FormField>

                  <FormField id="communicationMethod" icon={<Video size={16} />} label={t('coachprofile:communicationMethod', 'Kommunikationsmethode')}>
                    <Select
                      name="communicationMethod"
                      value={sessionDetails.communicationMethod}
                      onValueChange={(value) => setSessionDetails(p => ({...p, communicationMethod: value}))}
                    >
                      <SelectTrigger id="communicationMethod">
                        <SelectValue placeholder={t('coachprofile:selectMethod', 'Select method')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="video">{t('coachprofile:video', 'Video')}</SelectItem>
                        <SelectItem value="audio">{t('coachprofile:audio', 'Audio Only')}</SelectItem>
                        <SelectItem value="chat">{t('coachprofile:textChat', 'Text Chat')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>

                <DialogFooter className="p-4 bg-muted/50">
                  <Button type="button" variant="outline" onClick={onClose}>
                    {t('common:cancel', 'Abbrechen')}
                  </Button>
                  <Button type="submit">
                    {t('coachprofile:startSession', 'Sitzung starten')}
                  </Button>
                </DialogFooter>
              </form>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
};

export default LiveSessionModal;