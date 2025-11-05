import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import PaymentForm from './PaymentForm';

const localizer = momentLocalizer(moment);

const BookingSystem = ({ coachId, coachName, coachEmail, availableSlots, onBookingRequested, onBookingConfirmed }) => {
  const [events, setEvents] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringWeeks, setRecurringWeeks] = useState(4);

  useEffect(() => {
    const formattedEvents = availableSlots.map(slot => ({
      start: new Date(`${slot.date}T${slot.time}`),
      end: moment(`${slot.date}T${slot.time}`).add(1, 'hour').toDate(),
      title: moment(slot.time, 'HH:mm').format('h:mm A'),
      slot: slot
    }));
    setEvents(formattedEvents);
  }, [availableSlots]);

  const handleSelectEvent = (event) => {
    setSelectedSlot(event.slot);
  };

  const handleBookingConfirm = () => {
    if (!selectedSlot) {
      alert('Please select an available time slot.');
      return;
    }
    setShowPayment(true);
  };

  const handlePaymentComplete = () => {
    onBookingConfirmed({ 
      coachId, 
      ...selectedSlot, 
      isRecurring, 
      recurringWeeks: isRecurring ? recurringWeeks : null 
    });
    setSelectedSlot(null);
    setShowPayment(false);
    setIsRecurring(false);
    setRecurringWeeks(4);

    setEvents(prevEvents => prevEvents.filter(event => 
      !(moment(event.start).format('YYYY-MM-DD HH:mm') === `${selectedSlot.date} ${selectedSlot.time}`)
    ));
  };

  const eventStyleGetter = (event, start, end, isSelected) => {
    return {
      style: {
        backgroundColor: '#3174ad',
        borderRadius: '0px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block'
      }
    };
  };

  return (
    <div className="booking-system">
      <h2>Book a Session with {coachName}</h2>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: 500 }}
        onSelectEvent={handleSelectEvent}
        eventPropGetter={eventStyleGetter}
        views={['month']}
        defaultView="month"
        defaultDate={new Date(2024, 7, 1)} // Set to August 1, 2024
      />
      {selectedSlot && (
        <div className="booking-details">
          <h3>Selected Slot</h3>
          <p>Date: {moment(selectedSlot.date).format('MMMM D, YYYY')}</p>
          <p>Time: {moment(selectedSlot.time, 'HH:mm').format('h:mm A')}</p>
          <label>
            <input 
              type="checkbox" 
              checked={isRecurring} 
              onChange={(e) => setIsRecurring(e.target.checked)} 
            />
            Make this a recurring session
          </label>
          {isRecurring && (
            <select 
              value={recurringWeeks} 
              onChange={(e) => setRecurringWeeks(Number(e.target.value))}
            >
              <option value={4}>4 weeks</option>
              <option value={8}>8 weeks</option>
              <option value={12}>12 weeks</option>
            </select>
          )}
          <button onClick={handleBookingConfirm} className="confirm-booking-btn">Confirm Booking</button>
        </div>
      )}
      {showPayment && (
        <PaymentForm 
          amount={isRecurring ? 50 * recurringWeeks : 50} 
          onPaymentComplete={handlePaymentComplete} 
        />
      )}
    </div>
  );
};

export default BookingSystem;