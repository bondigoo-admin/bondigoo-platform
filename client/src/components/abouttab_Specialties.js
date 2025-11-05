// abouttab_Specialties.js

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, X } from 'lucide-react';
import debounce from 'lodash/debounce';
import * as coachAPI from '../services/coachAPI';
import { Input } from './ui/input.tsx';
import { Badge } from './ui/badge.tsx';

const AboutTabSpecialties = ({ specialties, isEditing, onUpdate }) => {
  const { t } = useTranslation(['common', 'coachprofile']);
  const [selectedSpecialties, setSelectedSpecialties] = useState(specialties || []);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const debouncedSearch = useCallback(
    debounce(async (term) => {
      if (term.length > 1) {
        try {
          const results = await coachAPI.searchSpecialties(term);
          setSearchResults(results.filter(r => !selectedSpecialties.includes(r)));
        } catch (error) {
          console.error('Error searching specialties:', error);
          // Handle error (e.g., show error message)
        }
      } else {
        setSearchResults([]);
      }
    }, 300),
    [selectedSpecialties] // Re-create debounce if selectedSpecialties changes
  );

  useEffect(() => {
    debouncedSearch(searchTerm);
  }, [searchTerm, debouncedSearch]);

  const handleSpecialtySelect = (specialty) => {
    if (!selectedSpecialties.includes(specialty)) {
      const updatedSpecialties = [...selectedSpecialties, specialty];
      setSelectedSpecialties(updatedSpecialties);
      onUpdate(updatedSpecialties);
    }
    setSearchTerm('');
    setSearchResults([]);
  };

  const handleSpecialtyRemove = (specialty) => {
    const updatedSpecialties = selectedSpecialties.filter(s => s !== specialty);
    setSelectedSpecialties(updatedSpecialties);
    onUpdate(updatedSpecialties);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-card-foreground flex items-center">
        <Award className="mr-2 h-5 w-5" />
        {t('coachprofile:specialties')}
      </h3>
      {isEditing && (
        <div className="relative">
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('coachprofile:searchSpecialties')}
            className="w-full"
          />
          {searchResults.length > 0 && (
            <ul className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
              {searchResults.map((specialty) => (
                <li
                  key={specialty}
                  onClick={() => handleSpecialtySelect(specialty)}
                  className="p-2 text-popover-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm"
                >
                  {specialty}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {selectedSpecialties.length > 0 ? selectedSpecialties.map((specialty) => (
          <Badge
            key={specialty}
            variant="secondary"
            className="text-sm"
          >
            {specialty}
            {isEditing && (
              <X
                className="ml-2 h-4 w-4 cursor-pointer rounded-full hover:bg-muted-foreground/20"
                onClick={() => handleSpecialtyRemove(specialty)}
              />
            )}
          </Badge>
        )) : (
          !isEditing && <p className="text-sm text-muted-foreground">{t('coachprofile:noSpecialties')}</p>
        )}
      </div>
    </div>
  );
};

export default AboutTabSpecialties;