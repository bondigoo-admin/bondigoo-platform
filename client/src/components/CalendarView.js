import React from 'react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

const CalendarView = ({ availableSlots, onSlotSelect, selectedSlot }) => {
  const handleDateChange = (date) => {
    const selectedSlot = availableSlots.find(slot => 
      new Date(`${slot.date}T${slot.time}`).getTime() === date.getTime()
    );
    if (selectedSlot) {
      onSlotSelect(selectedSlot);
    }
  };

  const availableDates = availableSlots.map(slot => new Date(`${slot.date}T${slot.time}`));

  return (
    <DatePicker
      selected={selectedSlot ? new Date(`${selectedSlot.date}T${selectedSlot.time}`) : null}
      onChange={handleDateChange}
      showTimeSelect
      timeFormat="HH:mm"
      timeIntervals={60}
      timeCaption="Time"
      dateFormat="MMMM d, yyyy h:mm aa"
      includeDates={availableDates}
      placeholderText="Select an available slot"
      inline
    />
  );
};

export default CalendarView;
