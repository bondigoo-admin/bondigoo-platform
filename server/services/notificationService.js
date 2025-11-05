const sendEmail = (to, subject, body) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`Email sent to ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body: ${body}`);
      resolve({ success: true });
    }, 1000);
  });
};

const sendBookingConfirmationEmail = (userEmail, coachName, date, time) => {
  const subject = "Booking Confirmation";
  const body = `
    Your booking with ${coachName} has been confirmed for ${date} at ${time}.
    
    Thank you for using our platform!
  `;

  return sendEmail(userEmail, subject, body);
};

const sendBookingRequestEmail = (coachEmail, userName, date, time) => {
  const subject = "New Booking Request";
  const body = `
    You have a new booking request from ${userName} for ${date} at ${time}.
    
    Please log in to your dashboard to approve or reject this request.
  `;

  return sendEmail(coachEmail, subject, body);
};

const sendBookingRejectionEmail = (coachEmail, userName, date, time) => {
  const subject = "New Booking Request";
  const body = `
    You have a new booking request from ${userName} for ${date} at ${time}.
    
    Your Booking has been rejected..
  `;

  return sendEmail(coachEmail, subject, body);
};

const sendBookingNotificationToCoach = (coachEmail, userName, date, time) => {
  const subject = "New Booking Notification";
  const body = `
    You have a new booking with ${userName} for ${date} at ${time}.
    
    Please log in to your dashboard for more details.
  `;

  return sendEmail(coachEmail, subject, body);
};

const sendBookingCancellationEmail = (coachName, userEmail, date, time) => {
  const subject = "Booking Cancellation";
  const body = `
    Your booking with ${coachName} for ${date} at ${time} has been cancelled.
    
    If you have any questions, please contact our support team.
  `;

  return sendEmail(userEmail, subject, body);
};

module.exports = {
  sendBookingConfirmationEmail,
  sendBookingRequestEmail,
  sendBookingRejectionEmail,
  sendBookingNotificationToCoach,
  sendBookingCancellationEmail
};