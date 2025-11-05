import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getCoachBookings, updateBookingStatus } from '../services/coachAPI';
import { subscribeToBookingUpdates, sendBookingUpdate } from '../services/socketService';
import moment from 'moment';
import { Check, X, Clock } from 'lucide-react';
import { sendBookingConfirmationEmail, sendBookingRejectionEmail } from '../services/emailService';
import { NotificationTypes, getBookingNotificationContent } from '../utils/notificationHelpers';
import { default as socketService } from '../services/socketService';
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { sendNotification } from '../services/socketService';

const CoachBookingManagement = ({ coachId }) => {
  const { t } = useTranslation(['common', 'bookings']);
  const [bookingRequests, setBookingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useContext(AuthContext);

  useEffect(() => {
    fetchBookings();
    const bookingUpdateListener = subscribeToBookingUpdates((data) => {
      // Refresh bookings or update the specific booking in the state
      fetchBookings();
    });

    return () => {
      if (bookingUpdateListener) {
        bookingUpdateListener.off();
      }
    };
  }, [coachId]);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const data = await getCoachBookings(coachId);
      setBookingRequests(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      setLoading(false);
    }
  };

  const handleApprove = async (bookingId) => {
    try {
      const updatedBooking = await updateBookingStatus(bookingId, 'confirmed');
      
      // Create notification content
      const notificationContent = getBookingNotificationContent(
        NotificationTypes.BOOKING_CONFIRMED,
        {
          ...updatedBooking,
          coachName: user.firstName
        },
        t
      );
  
      await sendNotification({
        recipient: updatedBooking.user,
        type: NotificationTypes.BOOKING_CONFIRMED,
        priority: 'medium',
        content: notificationContent,
        metadata: {
          bookingId: updatedBooking._id
        }
      });
  
      await sendBookingConfirmationEmail(
        updatedBooking.user.email,
        user.firstName,
        updatedBooking.start,
        updatedBooking.end
      );
      
      fetchBookings();
      toast.success(t('bookings:bookingConfirmed'));
    } catch (error) {
      console.error('Error approving booking:', error);
      toast.error(t('bookings:errorApprovingBooking'));
    }
  };

  const handleReject = async (bookingId) => {
    try {
      const updatedBooking = await updateBookingStatus(bookingId, 'declined');
      
      const notificationContent = getBookingNotificationContent(
        NotificationTypes.BOOKING_DECLINED,
        {
          ...updatedBooking,
          coachName: user.firstName
        },
        t
      );
  
      await sendNotification({
        recipient: updatedBooking.user,
        type: NotificationTypes.BOOKING_DECLINED,
        priority: 'medium',
        content: notificationContent,
        metadata: {
          bookingId: updatedBooking._id
        }
      });
  
      await sendBookingRejectionEmail(
        updatedBooking.user.email,
        user.firstName,
        updatedBooking.start,
        updatedBooking.end
      );
      
      fetchBookings();
      toast.success(t('bookings:bookingDeclined'));
    } catch (error) {
      console.error('Error rejecting booking:', error);
      toast.error(t('bookings:errorRejectingBooking'));
    }
  };

  if (loading) {
    return <div>{t('common:loading')}</div>;
  }
  
  if (error) {
    return <div>{t('bookings:errorFetchingBookings')}</div>;
  }
  
  if (bookingRequests.length === 0) {
    return <p>{t('bookings:noBookings')}</p>;
  }

  return (
    <div className="coach-booking-management">
      <h2>{t('bookings:title')}</h2>
      {bookingRequests.length === 0 ? (
        <p>{t('bookings:noBookings')}</p>
      ) : (
        <ul className="booking-list">
          {bookingRequests.map(booking => (
             <li key={booking._id} className="booking-item">
             <div className="booking-info">
      {booking.client ? (
        <p><strong>{booking.client.name}</strong></p>
      ) : (
        <p><strong>{t('bookings:availabilitySlot')}</strong></p>
      )}
                <p><Clock size={16} /> {moment(booking.start).format('MMMM D, YYYY HH:mm')} - {moment(booking.end).format('HH:mm')}</p>
                <p>{booking.sessionType.name}</p>
              </div>
              <div className="booking-actions">
                {booking.status === 'pending' && (
                  <>
                    <button onClick={() => handleApprove(booking._id)} className="btn-confirm">
                      <Check size={16} /> {t('bookings:confirm')}
                    </button>
                    <button onClick={() => handleReject(booking._id)} className="btn-cancel">
                      <X size={16} /> {t('bookings:cancel')}
                    </button>
                  </>
                )}
                {booking.status === 'confirmed' && (
                  <span className="status-confirmed">{t('bookings:confirmed')}</span>
                )}
                {booking.status === 'cancelled' && (
                  <span className="status-cancelled">{t('bookings:cancelled')}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CoachBookingManagement;