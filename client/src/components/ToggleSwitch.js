// ToggleSwitch.js
import React from 'react';
import * as Switch from '@radix-ui/react-switch';

const ToggleSwitch = ({ checked, onCheckedChange, label }) => (
  <div className="flex items-center">
    <Switch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="w-11 h-6 bg-gray-200 rounded-full relative data-[state=checked]:bg-blue-500"
    >
      <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[22px]" />
    </Switch.Root>
    <label className="ml-2 text-sm">{label}</label>
  </div>
);

export default ToggleSwitch;