import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Textarea } from './ui/textarea.tsx';
import { Label } from './ui/label.tsx';
import { Plus, Trash2 } from 'lucide-react';

const BioEditor = ({ initialBio, onBioChange }) => {
  const { t } = useTranslation(['common', 'coachprofile']);
  const [editedBio, setEditedBio] = useState([]);

  const MAX_CHARS_PER_SECTION = 2000;
  const MAX_TITLE_CHARS = 100;

  useEffect(() => {
    let bioArray = [];
    if (Array.isArray(initialBio) && initialBio.length > 0) {
      bioArray = initialBio.map(section => ({ ...section, id: section.id || crypto.randomUUID() }));
    }
    setEditedBio(bioArray);
  }, [initialBio]);

  const handleAddSection = () => {
    const newBio = [...editedBio, { id: crypto.randomUUID(), title: '', content: '' }];
    setEditedBio(newBio);
    onBioChange(newBio);
  };

  const handleRemoveSection = (idToRemove) => {
    const newBio = editedBio.filter(section => section.id !== idToRemove);
    setEditedBio(newBio);
    onBioChange(newBio);
  };

  const handleSectionChange = (id, field, value) => {
    const newBio = editedBio.map(section =>
      section.id === id ? { ...section, [field]: value } : section
    );
    setEditedBio(newBio);
    onBioChange(newBio);
  };

  return (
    <div className="w-full space-y-4">
      {editedBio.map((section) => (
        <div key={section.id} className="space-y-3 p-4 border rounded-md bg-background">
          <div className="grid w-full gap-1.5">
            <Label htmlFor={`title-${section.id}`} className="font-semibold">{t('coachprofile:bioSectionTitle')}</Label>
            <div className="relative flex items-center">
              <Input
                id={`title-${section.id}`}
                value={section.title}
                onChange={(e) => handleSectionChange(section.id, 'title', e.target.value)}
                placeholder={t('coachprofile:bioSectionTitlePlaceholder')}
                maxLength={MAX_TITLE_CHARS}
                className="pr-10"
              />
              <Button variant="ghost" size="icon" onClick={() => handleRemoveSection(section.id)} className="absolute right-1 h-8 w-8 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid w-full gap-1.5">
            <Label htmlFor={`content-${section.id}`} className="font-semibold">{t('coachprofile:bioSectionContent')}</Label>
            <Textarea
              id={`content-${section.id}`}
              value={section.content}
              onChange={(e) => handleSectionChange(section.id, 'content', e.target.value)}
              className="min-h-[120px] resize-y"
              placeholder={t('coachprofile:bioSectionContentPlaceholder')}
              maxLength={MAX_CHARS_PER_SECTION}
            />
            <p className="text-sm text-muted-foreground text-right">{(section.content || '').length} / {MAX_CHARS_PER_SECTION}</p>
          </div>
        </div>
      ))}
      <Button variant="outline" onClick={handleAddSection} className="w-full">
        <Plus className="mr-2 h-4 w-4" />
        {t('coachprofile:addBioSection')}
      </Button>
    </div>
  );
};

export default BioEditor;