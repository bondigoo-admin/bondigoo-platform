# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

# Video Conferencing System Documentation

This section documents the API endpoints and WebRTC configuration for the core video conferencing system implemented in Phase 1 (Weeks 1-4). The system supports one-on-one video sessions with secure access, core controls, basic chat, and mobile responsiveness.

## API Endpoints

All endpoints are prefixed with `/api/` and require authentication via a Bearer token in the `Authorization` header unless specified otherwise. The base URL is assumed to be `http://localhost:5000` in development.

### Session Link Generation and Management

#### 1. Generate Session Link
- **Endpoint**: `POST /sessions/generate/:bookingId`
- **Description**: Generates a secure session link for a confirmed booking.
- **Parameters**:
  - `bookingId` (path): The ID of the booking (MongoDB ObjectId).
- **Request Headers**:
  - `Authorization`: `Bearer <token>`
- **Response**:
  - **Success (200)**:
    ```json
    {
      "success": true,
      "sessionUrl": "http://localhost:3000/session/<sessionId>/<token>",
      "isNewLink": true
    }
Error (400): Invalid booking ID format.
json
Wrap
Copy
{ "success": false, "message": "Invalid booking ID format" }
Error (404): Booking not found.
json
Wrap
Copy
{ "success": false, "message": "Booking not found" }
Error (403): Unauthorized access.
json
Wrap
Copy
{ "success": false, "message": "Unauthorized access to booking" }
Notes: Returns an existing link if unexpired; otherwise, generates a new one. Coaches trigger a notification to clients.
2. Validate Session Link
Endpoint: GET /sessions/validate/:sessionId/:token
Description: Validates a session link and returns session status.
Parameters:
sessionId (path): The encrypted session ID.
token (path): The session token.
Request Headers:
Authorization: Bearer <token> (optional, determines user role)
Response:
Success (200, Valid):
json
Wrap
Copy
{
  "success": true,
  "isValid": true,
  "sessionDetails": {
    "bookingId": "123456789012",
    "sessionType": "One-on-One",
    "start": "2025-03-01T14:00:00.000Z",
    "end": "2025-03-01T15:00:00.000Z",
    "duration": 60,
    "coach": { "id": "coachId", "name": "Jane Smith" },
    "participant": { "id": "userId", "name": "John Doe" },
    "userRole": "coach" // or "participant" or null
  }
}
Success (200, Too Early):
json
Wrap
Copy
{
  "success": true,
  "isValid": false,
  "reason": "too_early",
  "sessionTime": "2025-03-01T14:00:00.000Z",
  "message": "Session has not started yet"
}
Success (200, Too Late):
json
Wrap
Copy
{
  "success": true,
  "isValid": false,
  "reason": "too_late",
  "sessionTime": "2025-03-01T15:00:00.000Z",
  "message": "Session has already ended"
}
Error (404): Invalid or expired link.
json
Wrap
Copy
{ "success": false, "message": "Invalid or expired session link" }
Notes: Updates session link expiration if too late.
3. Get Session Details
Endpoint: GET /sessions/:sessionId/details/:token
Description: Retrieves detailed session information for the video conference.
Parameters:
sessionId (path): The encrypted session ID.
token (path): The session token.
Request Headers:
Authorization: Bearer <token> (optional, determines user role)
Response:
Success (200):
json
Wrap
Copy
{
  "success": true,
  "sessionDetails": {
    "bookingId": "123456789012",
    "sessionType": {
      "id": "987654321098",
      "name": "One-on-One",
      "format": "one_on_one",
      "description": "Personal coaching session"
    },
    "start": "2025-03-01T14:00:00.000Z",
    "end": "2025-03-01T15:00:00.000Z",
    "duration": 60,
    "timeZone": "CET",
    "coach": {
      "id": "coachId",
      "name": "Jane Smith",
      "profilePicture": "url",
      "email": "jane@example.com"
    },
    "participant": {
      "id": "userId",
      "name": "John Doe",
      "profilePicture": "url",
      "email": "john@example.com"
    },
    "userRole": "coach", // or "participant" or null
    "agenda": "Goals review",
    "notes": "Bring notes",
    "previousSessions": [],
    "recordingEnabled": false,
    "autoRecording": false,
    "allowScreenSharing": true,
    "allowWhiteboard": true,
    "maxParticipants": 2
  }
}
Error (404): Invalid session or coach profile not found.
json
Wrap
Copy
{ "success": false, "message": "Invalid session link" }
Notes: Provides comprehensive session data for the frontend.
WebRTC Configuration
Overview
The video conferencing system uses WebRTC with simple-peer for peer-to-peer connections, integrated with Socket.IO for signaling. The configuration ensures compatibility and basic functionality for one-on-one sessions.

Configuration Details
Library: simple-peer (v9.11.1)
Signaling: Socket.IO (v4.7.5) under /video namespace
ICE Servers:
json
Wrap
Copy
{
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    { "urls": "stun:global.stun.twilio.com:3478?transport=udp" }
  ],
  "iceTransportPolicy": "all",
  "iceCandidatePoolSize": 10
}
Transport: WebSocket with polling fallback
Frontend Hook: useVideoConference.js
Initializes media streams (navigator.mediaDevices.getUserMedia).
Manages peer connections and cleanup.
Handles audio/video toggling and screen sharing via getDisplayMedia.
Backend: socketConfig.js
Manages /video namespace for signaling.
Events: join-session, signal, participant-joined, participant-left, session-ended, chat-message.
Key Features
Session Initiation: Triggered by startSession in useVideoConference.js, validated via session link.
Controls: Audio/video toggling and screen sharing implemented in ControlBar.js and ScreenShare.js.
Chat: Real-time messaging via chat-message event, displayed in ChatPanel.js.
Mobile Support: CSS media queries in component-specific files (e.g., VideoSession.css).
Development Setup
Environment: Requires REACT_APP_API_URL set to backend base URL (e.g., http://localhost:5000).
Testing: Unit tests in sessionController.test.js and useVideoConference.test.js using Jest.
Future Enhancements (Phase 2)
Group sessions with Mediasoup SFU.
Recording and playback capabilities.
Whiteboard and resource sharing.
text
Wrap
Copy

---

### Instructions
- **Where to Copy**: Paste this entire block into your `README.md`. If you already have a `README.md`, append it as a new section (e.g., under a heading like `# Video Conferencing System`) or replace any existing video conferencing documentation.
- **File Location**: Typically in the root directory (`./README.md`) or `server/README.md` if yo
