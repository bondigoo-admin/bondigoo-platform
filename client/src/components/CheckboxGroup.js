// CheckboxGroup.js
import React from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import { CheckIcon } from '@radix-ui/react-icons';
import { useTranslation } from 'react-i18next';

const CheckboxGroup = ({ options, selectedOptions, onChange, labelPrefix }) => {
  const { t } = useTranslation();

  const handleChange = (option) => {
    const newSelection = selectedOptions.includes(option)
      ? selectedOptions.filter((item) => item !== option)
      : [...selectedOptions, option];
    onChange(newSelection);
  };

  return (
    <div>
      {options.map((option) => (
        <div key={option} className="flex items-center mb-2">
          <Checkbox.Root
            className="flex h-4 w-4 items-center justify-center rounded-sm border border-gray-300 bg-white"
            checked={selectedOptions.includes(option)}
            onCheckedChange={() => handleChange(option)}
          >
            <Checkbox.Indicator>
              <CheckIcon />
            </Checkbox.Indicator>
          </Checkbox.Root>
          <label className="ml-2 text-sm">{t(`${labelPrefix}:${option}`)}</label>
        </div>
      ))}
    </div>
  );
};

export default CheckboxGroup;