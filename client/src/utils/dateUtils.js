import { format, differenceInMinutes } from 'date-fns';
import moment from 'moment';

export const initializeMomentLocale = (language) => {
  moment.locale(language);
};

export const getCalendarFormats = (localizer) => ({
  timeGutterFormat: (date, culture, l) =>
    l.format(date, 'HH:mm', culture),
  eventTimeRangeFormat: ({ start, end }, culture, l) =>
    `${l.format(start, 'HH:mm', culture)} - ${l.format(end, 'HH:mm', culture)}`,
  dayRangeHeaderFormat: ({ start, end }, culture, l) => {
    const startMonth = l.format(start, 'MMMM', culture);
    const endMonth = l.format(end, 'MMMM', culture);

    if (startMonth === endMonth) {
        return `${l.format(start, 'DD.', culture)} - ${l.format(end, 'DD. MMMM', culture)}`;
    }
    return `${l.format(start, 'DD. MMMM', culture)} - ${l.format(end, 'DD. MMMM', culture)}`;
  },
  monthHeaderFormat: (date, culture, l) =>
      l.format(date, 'MMMM YYYY', culture),
  dayHeaderFormat: (date, culture, l) =>
      l.format(date, 'dddd, DD. MMMM', culture),
});

export const formatDate = (date) => {
  return format(new Date(date), 'EEEE, MMMM d, yyyy');
};

export const formatTime = (date) => {
  return format(new Date(date), 'HH:mm');
};

export const calculateDuration = (start, end) => {
  return differenceInMinutes(new Date(end), new Date(start));
};

export const formatUserDateTime = (date, settings = {}) => {
    if (!date) return '';

    try {
        const dateObj = new Date(date);
        
        const options = {
            timeZone: settings.timeZone || 'Europe/Zurich',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: (settings.timeFormat || '24h') === '24h' ? 'h23' : 'h12',
        };
        
        const locale = settings.language === 'de' ? 'de-CH' : 'en-US';

        return new Intl.DateTimeFormat(locale, options).format(dateObj);
    } catch (error) {
        return new Date(date).toLocaleString();
    }
};