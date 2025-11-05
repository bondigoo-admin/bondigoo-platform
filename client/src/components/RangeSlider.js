// RangeSlider.js
import React from 'react';
import * as Slider from '@radix-ui/react-slider';

const RangeSlider = ({ min, max, step, value, onChange, formatLabel }) => (
  <div className="w-full">
    <Slider.Root
      className="relative flex items-center select-none touch-none w-full h-5"
      value={value}
      onValueChange={onChange}
      min={min}
      max={max}
      step={step}
    >
      <Slider.Track className="bg-gray-200 relative grow rounded-full h-1">
        <Slider.Range className="absolute bg-blue-500 rounded-full h-full" />
      </Slider.Track>
      {value.map((v, index) => (
        <Slider.Thumb
          key={index}
          className="block w-5 h-5 bg-white shadow-lg rounded-full hover:bg-blue-500 focus:outline-none focus:shadow-outline"
        />
      ))}
    </Slider.Root>
    <div className="flex justify-between mt-2">
      <span>{formatLabel(value[0])}</span>
      {value.length > 1 && <span>{formatLabel(value[1])}</span>}
    </div>
  </div>
);

export default RangeSlider;