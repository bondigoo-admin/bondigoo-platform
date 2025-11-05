import React from 'react';
import { Calendar } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

const DnDCalendar = withDragAndDrop(Calendar);

const DragAndDropCalendar = ({ events, onEventDrop, onEventResize, ...props }) => {
  return (
    <DnDCalendar
      events={events}
      onEventDrop={onEventDrop}
      onEventResize={onEventResize}
      resizable
      {...props}
    />
  );
};

export default DragAndDropCalendar;