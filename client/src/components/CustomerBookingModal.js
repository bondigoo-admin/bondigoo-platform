import React, { useState, useEffect, useContext } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import { X, Calendar as CalendarIcon, Clock, DollarSign, Repeat, Check, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthContext } from '../contexts/AuthContext';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);

const CustomerBookingModal = ({ 
  coachId, 
  coachName, 
  isOpen, 
  onClose, 
  onBookingConfirmed, 
  availableSlots, 
  coachRate,
  addUpcomingSession
}) => {
  const [events, setEvents] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringWeeks, setRecurringWeeks] = useState(4);
  const { userRole } = useContext(AuthContext);

  useEffect(() => {
    if (isOpen && availableSlots) {
      const formattedEvents = availableSlots.map(slot => ({
        start: new Date(`${slot.date}T${slot.time}`),
        end: moment(`${slot.date}T${slot.time}`).add(1, 'hour').toDate(),
        title: slot.status === 'available' ? 'Available' : 'Reserved',
        status: slot.status,
        slot: slot
      }));
      setEvents(formattedEvents);
    }
  }, [isOpen, availableSlots]);

  const handleSelectEvent = (event) => {
    if (event.status === 'available') {
      setSelectedSlot(event.slot);
    }
  };

  const handleBookingConfirm = () => {
    if (selectedSlot) {
      const bookingDetails = {
        coachId,
        coachName,
        ...selectedSlot,
        isRecurring,
        recurringWeeks: isRecurring ? recurringWeeks : null
      };
      onBookingConfirmed(bookingDetails);
      addUpcomingSession(bookingDetails);
      setSelectedSlot(null);
      onClose();
    }
  };

  const eventStyleGetter = (event) => {
    const backgroundColor = event.status === 'available' ? '#10B981' : '#EF4444';
    return {
      style: {
        backgroundColor,
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        padding: '2px 4px',
        fontSize: '0.8rem',
        fontWeight: 'bold',
      }
    };
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Book a Session with {coachName}</h2>
          <button onClick={onClose} className="close-button">
            <X size={24} />
          </button>
        </div>
        <div className="calendar-container">
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: 400 }}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventStyleGetter}
            views={[Views.MONTH, Views.WEEK]}
            defaultView={Views.WEEK}
            toolbar={true}
            formats={{
              timeGutterFormat: (date, culture, localizer) =>
                localizer.format(date, 'HH:mm', culture),
              eventTimeRangeFormat: ({ start, end }, culture, localizer) =>
                localizer.format(start, 'HH:mm', culture) + ' - ' +
                localizer.format(end, 'HH:mm', culture),
            }}
          />
        </div>
        <AnimatePresence>
          {selectedSlot && (
            <motion.div
              className="booking-popup"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
            >
              <h3>Confirm Your Booking</h3>
              <div className="booking-details">
                <div className="detail-item">
                  <CalendarIcon size={20} />
                  <span>{moment(selectedSlot.date).format('MMMM D, YYYY')}</span>
                </div>
                <div className="detail-item">
                  <Clock size={20} />
                  <span>{moment(selectedSlot.time, 'HH:mm').format('h:mm A')}</span>
                </div>
                <div className="detail-item">
                  <DollarSign size={20} />
                  <span>${coachRate} per hour</span>
                </div>
              </div>
              <div className="recurring-option">
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={isRecurring} 
                    onChange={(e) => setIsRecurring(e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
                <span>Make this a recurring session</span>
              </div>
              {isRecurring && (
                <div className="recurring-weeks">
                  <label>Number of weeks:</label>
                  <select 
                    value={recurringWeeks} 
                    onChange={(e) => setRecurringWeeks(Number(e.target.value))}
                  >
                    <option value={4}>4 weeks</option>
                    <option value={8}>8 weeks</option>
                    <option value={12}>12 weeks</option>
                  </select>
                </div>
              )}
              <div className="booking-actions">
                <button onClick={() => setSelectedSlot(null)} className="cancel-button">
                  Cancel
                </button>
                <button onClick={handleBookingConfirm} className="confirm-button">
                  Confirm Booking
                  <ArrowRight size={20} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {!selectedSlot && (
          <div className="instructions">
            <CalendarIcon size={48} />
            <p>Please select an available time slot from the calendar above.</p>
            <p>Green slots are available, red slots are already reserved.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerBookingModal;