import React from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog.tsx';
import { Card, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { Video, FileText, File as FileIcon, Lightbulb, ClipboardCheck, Presentation } from 'lucide-react';
import { cn } from '../../lib/utils';

const lessonTypes = [
  { type: 'video', icon: Video, titleKey: 'content_type_video', descKey: 'content_type_video_desc' },
  { type: 'presentation', icon: Presentation, titleKey: 'content_type_presentation', descKey: 'content_type_presentation_desc' },
  { type: 'text', icon: FileText, titleKey: 'content_type_text', descKey: 'content_type_text_desc' },
  { type: 'document', icon: FileIcon, titleKey: 'content_type_document', descKey: 'content_type_document_desc' },
  { type: 'quiz', icon: Lightbulb, titleKey: 'content_type_quiz', descKey: 'content_type_quiz_desc' },
  { type: 'assignment', icon: ClipboardCheck, titleKey: 'content_type_assignment', descKey: 'content_type_assignment_desc' },
];

const LessonTypeSelector = ({ isOpen, setIsOpen, onSelect }) => {
  const { t } = useTranslation(['programs']);

  const handleSelect = (type) => {
    onSelect(type);
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('select_lesson_type_title')}</DialogTitle>
          <DialogDescription>
            {t('select_lesson_type_desc', 'Choose the type of content you want to create for this lesson.')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 py-4 md:grid-cols-2">
          {lessonTypes.map(({ type, icon: Icon, titleKey, descKey }) => (
            <Card 
              key={type} 
              onClick={() => handleSelect(type)}
              className="cursor-pointer transition-all hover:-translate-y-1 hover:border-primary hover:bg-accent hover:shadow-md"
            >
              <CardHeader className="flex flex-row items-center gap-4 p-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-grow">
                  <CardTitle className="text-base">{t(titleKey)}</CardTitle>
                  <CardDescription className="mt-1 text-xs">{t(descKey)}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LessonTypeSelector;