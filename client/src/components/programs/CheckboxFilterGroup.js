import React from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '../ui/checkbox.tsx';
import { Label } from '../ui/label.tsx';

const CheckboxFilterGroup = ({ options, selectedValues, onChange }) => {
  const { t } = useTranslation('programs');

  const handleCheckedChange = (checked, id) => {
    const newValues = checked
      ? [...selectedValues, id]
      : selectedValues.filter(v => v !== id);
    onChange(newValues);
  };

  return (
    <div className="space-y-2">
      {options.map(option => (
        <div key={option.id} className="flex items-center space-x-2">
          <Checkbox
            id={`filter-${option.id}`}
            checked={selectedValues.includes(option.id)}
            onCheckedChange={(checked) => handleCheckedChange(checked, option.id)}
          />
          <Label htmlFor={`filter-${option.id}`} className="font-normal cursor-pointer">
            {t(option.labelKey, option.labelDefault)}
          </Label>
        </div>
      ))}
    </div>
  );
};

export default CheckboxFilterGroup;