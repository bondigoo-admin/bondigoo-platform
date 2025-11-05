import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import { Dialog, Transition } from '@headlessui/react';
import { X as CloseIcon, Users as GroupIcon, User as SingleUserIcon } from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);

const SessionBookingDialog = ({ coachId, coachName, isOpen, onClose, onBookingConfirmed }) => {
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);
  const [isRecurringSession, setIsRecurringSession] = useState(false);
  const [recurringDuration, setRecurringDuration] = useState(4);

  useEffect(() => {
    if (isOpen) {
      fetchCoachAvailability();
    }
  }, [isOpen, coachId]);

  const fetchCoachAvailability = async () => {
    // This would be an API call in a real application
    const mockAvailability = [
      { id: 1, date: '2024-08-01', time: '10:00', type: 'individual', title: 'Individual Session' },
      { id: 2, date: '2024-08-01', time: '14:00', type: 'group', title: 'Group: Yoga', maxParticipants: 10, currentParticipants: 5 },
      { id: 3, date: '2024-08-02', time: '11:00', type: 'individual', title: 'Individual Session' },
      { id: 4, date: '2024-08-03', time: '15:00', type: 'group', title: 'Group: Meditation', maxParticipants: 15, currentParticipants: 8 },
    ];

    const formattedSlots = mockAvailability.map(slot => ({
      id: slot.id,
      start: new Date(`${slot.date}T${slot.time}`),
      end: moment(`${slot.date}T${slot.time}`).add(1, 'hour').toDate(),
      title: slot.title,
      type: slot.type,
      maxParticipants: slot.maxParticipants,
      currentParticipants: slot.currentParticipants,
      rawSlot: slot
    }));
    setAvailableSlots(formattedSlots);
  };

  const handleSlotSelection = (slot) => {
    setSelectedTimeSlot(slot);
  };

  const handleBookingSubmit = () => {
    if (selectedTimeSlot) {
      onBookingConfirmed({
        coachId,
        ...selectedTimeSlot,
        isRecurring: isRecurringSession,
        recurringWeeks: isRecurringSession ? recurringDuration : null
      });
      onClose();
    }
  };

  const slotStyleGetter = (slot) => {
    let backgroundColor = slot.type === 'individual' ? '#4299e1' : '#48bb78';
    let textColor = 'white';

    if (slot.type === 'group' && slot.currentParticipants >= slot.maxParticipants) {
      backgroundColor = '#f56565';
    }

    return {
      style: {
        backgroundColor,
        color: textColor,
        borderRadius: '4px',
        border: 'none',
        display: 'block'
      }
    };
  };

  return (
    <Transition show={isOpen} as={React.Fragment}>
      <Dialog 
        as="div" 
        className="fixed inset-0 z-10 overflow-y-auto" 
        onClose={onClose}
      >
        <div className="min-h-screen px-4 text-center">
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />
          </Transition.Child>

          <span className="inline-block h-screen align-middle" aria-hidden="true">&#8203;</span>

          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <div className="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">
              <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                Book a Session with {coachName}
              </Dialog.Title>
              <button
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-500"
                onClick={onClose}
              >
                <CloseIcon className="h-6 w-6" aria-hidden="true" />
              </button>
              <div className="mt-2">
                <Calendar
                  localizer={localizer}
                  events={availableSlots}
                  startAccessor="start"
                  endAccessor="end"
                  style={{ height: 400 }}
                  onSelectEvent={handleSlotSelection}
                  eventPropGetter={slotStyleGetter}
                  views={['month', 'week', 'day']}
                  defaultView="month"
                />
              </div>
              {selectedTimeSlot && (
                <div className="mt-4">
                  <p className="text-sm text-gray-500">
                    Selected: {moment(selectedTimeSlot.start).format('MMMM D, YYYY h:mm A')} - {moment(selectedTimeSlot.end).format('h:mm A')}
                  </p>
                  <p className="text-sm text-gray-500 flex items-center mt-2">
                    {selectedTimeSlot.type === 'individual' ? (
                      <>
                        <SingleUserIcon className="h-5 w-5 mr-2" />
                        Individual Session
                      </>
                    ) : (
                      <>
                        <GroupIcon className="h-5 w-5 mr-2" />
                        Group Session: {selectedTimeSlot.currentParticipants}/{selectedTimeSlot.maxParticipants} participants
                      </>
                    )}
                  </p>
                  {selectedTimeSlot.type === 'individual' && (
                    <div className="mt-4">
                      <label className="inline-flex items-center">
                        <input 
                          type="checkbox" 
                          className="form-checkbox"
                          checked={isRecurringSession} 
                          onChange={(e) => setIsRecurringSession(e.target.checked)} 
                        />
                        <span className="ml-2">Make this a recurring session</span>
                      </label>
                      {isRecurringSession && (
                        <select 
                          value={recurringDuration} 
                          onChange={(e) => setRecurringDuration(Number(e.target.value))}
                          className="mt-2 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        >
                          <option value={4}>4 weeks</option>
                          <option value={8}>8 weeks</option>
                          <option value={12}>12 weeks</option>
                        </select>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="mt-4 inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                    onClick={handleBookingSubmit}
                  >
                    Confirm Booking
                  </button>
                </div>
              )}
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
};

export default SessionBookingDialog;