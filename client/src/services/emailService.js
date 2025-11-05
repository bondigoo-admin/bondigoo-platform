const sendEmail = async (to, subject, body) => {
  try {
    const response = await fetch('/api/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, subject, body }),
    });
    return response.json();
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

export const sendBookingConfirmationEmail = async (userEmail, coachName, date, time) => {
  const subject = "Booking Confirmation";
  const body = `
    Your booking with ${coachName} has been confirmed for ${date} at ${time}.
    
    Thank you for using our platform!
  `;

  return sendEmail(userEmail, subject, body);
};

export const sendBookingRejectionEmail = async (userEmail, coachName, date, time) => {
  const subject = "Booking Rejected";
  const body = `
    Your booking with ${coachName} for ${date} at ${time} has been rejected.
    
    Please log in to the platform to book another session.
  `;

  return sendEmail(userEmail, subject, body);
};

export const sendBookingRequestEmail = async (coachEmail, userName, date, time) => {
  const subject = "New Booking Request";
  const body = `
    You have a new booking request from ${userName} for ${date} at ${time}.
    
    Please log in to your dashboard to approve or reject this request.
  `;

  return sendEmail(coachEmail, subject, body);
};

export const sendBookingCancellationEmail = async (recipientEmail, otherPartyName, date, time, isCanceller) => {
  const subject = "Booking Cancellation";
  const body = isCanceller
    ? `You have cancelled your booking with ${otherPartyName} for ${date} at ${time}.`
    : `Your booking with ${otherPartyName} for ${date} at ${time} has been cancelled.`;

  return sendEmail(recipientEmail, subject, body);
};