import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button.tsx';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion.jsx';
import { Edit, Save, X } from 'lucide-react';
import BioEditor from './BioEditor';

const AboutTabBio = ({ bio, isOwnProfile, onUpdate }) => {
  const { t } = useTranslation(['common', 'coachprofile']);
  
  const [isBioEditing, setIsBioEditing] = useState(false);
  const [editedBio, setEditedBio] = useState([]);

  const getInitialBio = (bioProp) => {
    if (Array.isArray(bioProp) && bioProp.length > 0) {
      return bioProp.map(section => ({ ...section, id: section.id || crypto.randomUUID() }));
    }
    if (typeof bioProp === 'string' && bioProp.trim() !== '') {
      return [{ id: crypto.randomUUID(), title: t('coachprofile:bioBackgroundTitle'), content: bioProp }];
    }
    return [];
  };

  useEffect(() => {
    setEditedBio(getInitialBio(bio));
  }, [bio, t]);

  const handleSave = () => {
    const finalBio = editedBio.filter(section => section.title.trim() !== '' || section.content.trim() !== '');
    onUpdate(finalBio);
    setIsBioEditing(false);
  };

  const handleCancel = () => {
    setEditedBio(getInitialBio(bio));
    setIsBioEditing(false);
  };

  const hasContent = useMemo(() => {
    return editedBio.some(section => (section.title && section.title.trim() !== '') || (section.content && section.content.trim() !== ''));
  }, [editedBio]);

  if (isBioEditing) {
    return (
      <div className="w-full space-y-4 rounded-md border border-input bg-transparent p-4 md:p-6">
        <BioEditor initialBio={editedBio} onBioChange={setEditedBio} />
        <div className="flex justify-end space-x-2 pt-4 border-t border-border mt-4">
          <Button variant="ghost" onClick={handleCancel}>
            <X className="mr-2 h-4 w-4" />
            {t('common:cancel')}
          </Button>
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            {t('common:save')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full relative group">
      {isOwnProfile && hasContent && (
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setIsBioEditing(true)} 
          className="absolute mr-4 top-0 right-0 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
          <Edit className="h-4 w-4" />
        </Button>
      )}

      {hasContent ? (
        <Accordion type="multiple" className="w-full" defaultValue={editedBio.length > 0 ? [editedBio[0].id] : []}>
          {editedBio.map(section => (
            (section.title?.trim() && section.content?.trim()) && (
              <AccordionItem value={section.id} key={section.id}>
                <AccordionTrigger>{section.title}</AccordionTrigger>
                <AccordionContent className="whitespace-pre-wrap text-sm text-muted-foreground">{section.content}</AccordionContent>
              </AccordionItem>
            )
          ))}
        </Accordion>
      ) : (
        <div className="border border-dashed rounded-md p-6 text-center">
            <p className="text-sm text-muted-foreground italic">
            {t('coachprofile:noBiography')}
            </p>
            {isOwnProfile && (
                <Button variant="secondary" size="sm" className="mt-4" onClick={() => setIsBioEditing(true)}>
                    {t('coachprofile:addBiography')}
                </Button>
            )}
        </div>
      )}
    </div>
  );
};

export default AboutTabBio;