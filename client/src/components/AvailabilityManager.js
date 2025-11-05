import React, { useState } from 'react';

const AvailabilityManager = ({ coachId, initialAvailability, onSave }) => {
  const [availability, setAvailability] = useState(initialAvailability || []);

  const addSlot = () => {
    setAvailability([...availability, { date: '', time: '' }]);
  };

  const updateSlot = (index, field, value) => {
    const updatedAvailability = [...availability];
    updatedAvailability[index][field] = value;
    setAvailability(updatedAvailability);
  };

  const removeSlot = (index) => {
    setAvailability(availability.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave(availability);
  };

  return (
    <div className="availability-manager">
      <h3>Manage Your Availability</h3>
      {availability.map((slot, index) => (
        <div key={index} className="availability-slot">
          <input
            type="date"
            value={slot.date}
            onChange={(e) => updateSlot(index, 'date', e.target.value)}
          />
          <input
            type="time"
            value={slot.time}
            onChange={(e) => updateSlot(index, 'time', e.target.value)}
          />
          <button onClick={() => removeSlot(index)}>Remove</button>
        </div>
      ))}
      <button onClick={addSlot}>Add Slot</button>
      <button onClick={handleSave}>Save Availability</button>
    </div>
  );
};

export default AvailabilityManager;