import React, { useState, useEffect, useRef } from 'react';

const Chatbot = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  const handleSendMessage = () => {
    if (input.trim() === '') return;

    const newMessages = [...messages, { text: input, sender: 'user' }];
    setMessages(newMessages);
    setInput('');

    // Simulate AI response
    setTimeout(() => {
      const response = getAIResponse(input);
      setMessages([...newMessages, { text: response, sender: 'bot' }]);
    }, 1000);
  };

  const getAIResponse = (userInput) => {
    const lowerInput = userInput.toLowerCase();
    if (lowerInput.includes('hello') || lowerInput.includes('hi')) {
      return "Hello! How can I assist you today?";
    } else if (lowerInput.includes('book') || lowerInput.includes('appointment')) {
      return "To book an appointment, please go to our booking page and select an available time slot with your preferred coach.";
    } else if (lowerInput.includes('price') || lowerInput.includes('cost')) {
      return "Our coaching sessions start at $50 per hour. Prices may vary depending on the coach and the type of session.";
    } else if (lowerInput.includes('cancel') || lowerInput.includes('reschedule')) {
      return "To cancel or reschedule an appointment, please log in to your account and go to the 'My Bookings' section.";
    } else {
      return "I'm sorry, I didn't quite understand that. Could you please rephrase your question?";
    }
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className={`chatbot ${isOpen ? 'open' : ''}`}>
      {isOpen ? (
        <>
          <div className="chat-header">
            <h3>Chat with us</h3>
            <button onClick={toggleChat} className="close-btn">&times;</button>
          </div>
          <div className="chat-messages">
            {messages.map((message, index) => (
              <div key={index} className={`message ${message.sender}`}>
                {message.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="chat-input">
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type your message here..."
            />
            <button onClick={handleSendMessage}>Send</button>
          </div>
        </>
      ) : (
        <button onClick={toggleChat} className="chat-icon">
          💬
        </button>
      )}
    </div>
  );
};

export default Chatbot;