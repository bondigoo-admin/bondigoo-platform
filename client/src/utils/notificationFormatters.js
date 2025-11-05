// utils/notificationFormatters.js
import moment from 'moment';
import { logger } from './logger';
import { NotificationTypes } from './notificationHelpers';

export class BookingNotificationFormatter {
  static formatDateTime(date) {
    if (!date) {
      logger.warn('[BookingNotificationFormatter] Attempted to format undefined date');
      return 'Invalid date';
    }
    return moment(date).format('DD.MM.YYYY HH:mm');
  }

  static formatTime(date) {
    if (!date) {
      logger.warn('[BookingNotificationFormatter] Attempted to format undefined time');
      return 'Invalid time';
    }
    return moment(date).format('HH:mm');
  }

  static calculateDuration(start, end) {
    if (!start || !end) {
      logger.warn('[BookingNotificationFormatter] Missing start or end time for duration calculation', {
        start,
        end
      });
      return 0;
    }
    return moment(end).diff(moment(start), 'minutes');
  }

  static getNotificationIcon(type) {
    switch (type) {
      case NotificationTypes.BOOKING_REQUEST:
      case NotificationTypes.BOOKING_CONFIRMED:
      case NotificationTypes.BOOKING_DECLINED:
      case NotificationTypes.BOOKING_CANCELLED:
        return 'calendar';
      case NotificationTypes.SESSION_REMINDER:
      case NotificationTypes.SESSION_STARTING:
        return 'clock';
      default:
        return 'bell';
    }
  }

  static formatBookingData(notification) {
    console.log('[BookingNotificationFormatter] Starting format:', {
      notificationId: notification._id,
      type: notification.type,
      hasMetadata: !!notification.metadata,
      rawBookingData: notification.metadata?.bookingId
    });

    const bookingData = notification.metadata?.bookingId;

    // Return early if no booking data
    if (!bookingData) {
      console.warn('[BookingNotificationFormatter] No booking data found:', {
        notificationId: notification._id,
        type: notification.type
      });
      return {
        error: true,
        title: notification.content?.title || 'Booking Update',
        message: notification.content?.message || 'No booking details available'
      };
    }

    // If booking data is already populated
    if (typeof bookingData === 'object' && bookingData !== null) {
      try {
        const startDate = bookingData.start ? moment(bookingData.start) : null;
        const endDate = bookingData.end ? moment(bookingData.end) : null;
        
        let duration = 0;
        let formattedTime = 'TBA';
        let formattedDate = 'TBA';

        if (startDate && startDate.isValid()) {
          formattedTime = this.formatTime(startDate);
          formattedDate = startDate.format('DD.MM');
          
          if (endDate && endDate.isValid()) {
            duration = this.calculateDuration(startDate, endDate);
          }
        }
        
        return {
          title: `${bookingData.sessionType?.name || 'Session'} ${formattedTime}`,
          time: formattedTime,
          date: formattedDate,
          duration,
          sessionType: bookingData.sessionType?.name || 'Session',
          participants: {
            coach: bookingData.coach?.firstName ? 
              `${bookingData.coach.firstName} ${bookingData.coach.lastName}` : 
              'Unknown Coach',
            client: bookingData.user?.firstName ? 
              `${bookingData.user.firstName} ${bookingData.user.lastName}` : 
              'Unknown Client'
          },
          status: bookingData.status || 'unknown'
        };
      } catch (error) {
        console.error('[BookingNotificationFormatter] Error formatting booking:', {
          error: error.message,
          bookingData
        });
        return {
          error: true,
          title: 'Booking Data Error',
          message: 'There was an error processing the booking details'
        };
      }
    }

    // If we have a string ID, return placeholder data
    return {
      needsBookingData: true,
      bookingId: typeof bookingData === 'string' ? bookingData : null,
      title: notification.content?.title || 'Loading Booking Details...',
      message: notification.content?.message || 'Please wait...'
    };
  }

  static getDisplayContent(notification) {
    console.log('[BookingNotificationFormatter] Getting display content for:', {
      type: notification.type,
      id: notification._id
    });

    const formattedData = this.formatBookingData(notification);
    
    if (formattedData.error || formattedData.needsBookingData) {
      return formattedData;
    }

    const { title, time, duration, date, sessionType, participants, status } = formattedData;

    const baseContent = {
      icon: this.getNotificationIcon(notification.type),
      duration,
      time,
      date,
      status
    };

    switch (notification.type) {
      case NotificationTypes.SESSION_REMINDER:
        return {
          ...baseContent,
          title: `${sessionType} ${time}`,
          message: `${duration}min • ${date}`
        };
      
      case NotificationTypes.BOOKING_CONFIRMED:
        return {
          ...baseContent,
          title: `${sessionType} ${time}`,
          message: `${duration}min • ${date} • ${participants.coach}`,
          coach: participants.coach
        };

      case NotificationTypes.BOOKING_REQUEST:
        return {
          ...baseContent,
          title: `${sessionType} ${time}`,
          message: `${duration}min • ${date} • ${participants.client}`,
          client: participants.client
        };

      default:
        return {
          ...baseContent,
          title: title || `${sessionType} Update`,
          message: `${duration > 0 ? `${duration}min • ` : ''}${date}`
        };
    }
  }
}

export default BookingNotificationFormatter;