import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const TopicDetail = () => {
  const { topicId } = useParams();
  const [topic, setTopic] = useState(null);
  const [replies, setReplies] = useState([]);
  const [newReply, setNewReply] = useState('');

  useEffect(() => {
    // In a real application, you would fetch topic and replies from an API
    const mockTopic = {
      id: topicId,
      title: 'Welcome to our community!',
      content: 'This is a great place to share experiences and learn from each other.',
      author: 'Admin',
      date: '2023-08-20'
    };
    const mockReplies = [
      { id: 1, content: 'Great to be here!', author: 'NewMember', date: '2023-08-20' },
      { id: 2, content: 'Looking forward to learning from everyone.', author: 'EagerLearner', date: '2023-08-21' },
    ];
    setTopic(mockTopic);
    setReplies(mockReplies);
  }, [topicId]);

  const handleReplyChange = (e) => {
    setNewReply(e.target.value);
  };

  const handleSubmitReply = (e) => {
    e.preventDefault();
    // In a real application, you would send this data to an API
    const newReplyObj = {
      id: replies.length + 1,
      content: newReply,
      author: 'CurrentUser',
      date: new Date().toISOString().split('T')[0]
    };
    setReplies([...replies, newReplyObj]);
    setNewReply('');
  };

  if (!topic) return <div>Loading...</div>;

  return (
    <div className="topic-detail">
      <h2>{topic.title}</h2>
      <div className="topic-content">
        <p>{topic.content}</p>
        <p>Posted by: {topic.author} on {topic.date}</p>
      </div>
      <div className="replies">
        <h3>Replies</h3>
        {replies.map(reply => (
          <div key={reply.id} className="reply">
            <p>{reply.content}</p>
            <p>Replied by: {reply.author} on {reply.date}</p>
          </div>
        ))}
      </div>
      <div className="new-reply">
        <h3>Add a Reply</h3>
        <form onSubmit={handleSubmitReply}>
          <textarea
            value={newReply}
            onChange={handleReplyChange}
            placeholder="Your reply"
            required
          ></textarea>
          <button type="submit">Post Reply</button>
        </form>
      </div>
    </div>
  );
};

export default TopicDetail;