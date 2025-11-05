import React, { useState } from 'react';

const BookingModal = ({ coach, onClose }) => {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Here you would typically send this data to your backend
    console.log('Booking submitted:', { coach: coach.name, date, time, message });
    alert('Booking request sent!');
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Book a Session with {coach.name}</h2>
        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="date">Date:</label>
            <input
              type="date"
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="time">Time:</label>
            <input
              type="time"
              id="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="message">Message (optional):</label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows="4"
            ></textarea>
          </div>
          <button type="submit">Request Booking</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </form>
      </div>
    </div>
  );
};

export default BookingModal;