import React, { useState, useEffect } from 'react';

function ApiTest() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/hello')
      .then(response => response.text())
      .then(data => setMessage(data));
  }, []);

  return (
    <div>
      <h1>API Test</h1>
      <p>{message}</p>
    </div>
  );
}

export default ApiTest;