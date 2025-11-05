import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getUserBookings } from '../services/userAPI';
import moment from 'moment';
import { Clock, User } from 'lucide-react';

const ClientBookingHistory = ({ clientId }) => {
  const { t } = useTranslation(['common', 'bookinghistory']);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookings();
  }, [clientId]);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const data = await getUserBookings(clientId);
      setBookings(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return <div>{t('common:loading')}</div>;
  }

  return (
    <div className="client-booking-history">
      <h2>{t('bookinghistory:title')}</h2>
      {bookings.length === 0 ? (
        <p>{t('bookinghistory:noBookings')}</p>
      ) : (
        <ul className="booking-list">
          {bookings.map(booking => (
            <li key={booking.id} className="booking-item">
              <div className="booking-info">
                <p><User size={16} /> <strong>{booking.coach.name}</strong></p>
                <p><Clock size={16} /> {moment(booking.start).format('MMMM D, YYYY HH:mm')} - {moment(booking.end).format('HH:mm')}</p>
                <p>{booking.sessionType.name}</p>
              </div>
              <div className="booking-status">
                <span className={`status-${booking.status}`}>
                  {t(`bookinghistory:${booking.status}`)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ClientBookingHistory;