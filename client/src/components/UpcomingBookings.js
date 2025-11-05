import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import moment from 'moment';
import { getUpcomingBookings, updateBookingStatus } from '../services/coachAPI';
import { Calendar, Clock, User } from 'lucide-react';

const UpcomingBookings = () => {
  const { t } = useTranslation(['common', 'bookings']);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const data = await getUpcomingBookings();
      setBookings(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching upcoming bookings:', error);
      setLoading(false);
    }
  };

  const handleStatusChange = async (bookingId, newStatus) => {
    try {
      await updateBookingStatus(bookingId, newStatus);
      fetchBookings(); // Refresh the bookings list
      toast.success(t('bookings:statusUpdateSuccess'));
    } catch (error) {
      console.error('Error updating booking status:', error);
      toast.error(t('bookings:statusUpdateError'));
    }
  };

  if (loading) {
    return <div>{t('common:loading')}</div>;
  }

  return (
    <div className="upcoming-bookings">
      <h2>{t('bookings:upcomingBookings')}</h2>
      {bookings.length === 0 ? (
        <p>{t('bookings:noUpcomingBookings')}</p>
      ) : (
        <ul>
          {bookings.map(booking => (
            <li key={booking.id} className="booking-item">
              <div className="booking-info">
                <div><Calendar size={16} /> {moment(booking.start).format('MMMM D, YYYY')}</div>
                <div><Clock size={16} /> {moment(booking.start).format('h:mm A')} - {moment(booking.end).format('h:mm A')}</div>
                <div><User size={16} /> {booking.coachName || booking.clientName}</div>
                <div>{booking.sessionTypeName}</div>
                <div>{t('bookings:status')}: {t(`bookings:${booking.status}`)}</div>
              </div>
              {booking.status === 'pending' && (
                <div className="booking-actions">
                  <button onClick={() => handleStatusChange(booking.id, 'confirmed')}>{t('bookings:confirm')}</button>
                  <button onClick={() => handleStatusChange(booking.id, 'cancelled')}>{t('bookings:cancel')}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default UpcomingBookings;