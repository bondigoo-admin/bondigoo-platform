import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  MessageSquare, Users, TrendingUp, Search, 
  PlusCircle, ThumbsUp, MessageCircle, Eye
} from 'lucide-react';

const Forum = () => {
  const [topics, setTopics] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [newTopic, setNewTopic] = useState({ title: '', content: '', category: '' });

  useEffect(() => {
    fetchTopics();
    fetchCategories();
  }, []);

  const fetchTopics = () => {
    // Simulated API call
    setTimeout(() => {
      setTopics([
        { id: 1, title: 'Tips for effective goal setting', author: 'JohnDoe', category: 'Productivity', replies: 15, views: 150, likes: 32, lastReply: '2024-08-20' },
        { id: 2, title: 'Overcoming public speaking anxiety', author: 'JaneSmith', category: 'Personal Development', replies: 8, views: 95, likes: 20, lastReply: '2024-08-19' },
        { id: 3, title: 'Best practices for work-life balance', author: 'MikeJohnson', category: 'Wellness', replies: 22, views: 210, likes: 45, lastReply: '2024-08-18' },
        { id: 4, title: 'Effective communication in remote teams', author: 'EmilyBrown', category: 'Career', replies: 12, views: 130, likes: 28, lastReply: '2024-08-17' },
      ]);
    }, 500);
  };

  const fetchCategories = () => {
    setCategories(['All', 'Productivity', 'Personal Development', 'Wellness', 'Career']);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewTopic(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // In a real app, you'd send this data to your API
    console.log('New topic:', newTopic);
    // Reset form and refetch topics
    setNewTopic({ title: '', content: '', category: '' });
    fetchTopics();
  };

  const filteredTopics = topics.filter(topic => 
    (selectedCategory === 'All' || topic.category === selectedCategory) &&
    topic.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="forum">
      <h2><MessageSquare size={24} /> Community Forum</h2>
      
      <div className="forum-controls">
        <div className="search-bar">
          <Search size={20} />
          <input 
            type="text" 
            placeholder="Search topics..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="category-filter">
          <select 
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            {categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="forum-stats">
        <div className="stat-item">
          <Users size={20} />
          <span>Active Users: 1,234</span>
        </div>
        <div className="stat-item">
          <MessageSquare size={20} />
          <span>Total Topics: {topics.length}</span>
        </div>
        <div className="stat-item">
          <TrendingUp size={20} />
          <span>New Posts Today: 57</span>
        </div>
      </div>

      <div className="topic-list">
        {filteredTopics.map(topic => (
          <div key={topic.id} className="topic-item">
            <h3><Link to={`/forum/topic/${topic.id}`}>{topic.title}</Link></h3>
            <p className="topic-meta">
              Posted by {topic.author} in {topic.category}
            </p>
            <div className="topic-stats">
              <span><MessageCircle size={16} /> {topic.replies} replies</span>
              <span><Eye size={16} /> {topic.views} views</span>
              <span><ThumbsUp size={16} /> {topic.likes} likes</span>
            </div>
            <p className="last-reply">Last reply on {topic.lastReply}</p>
          </div>
        ))}
      </div>

      <div className="new-topic-form">
        <h3><PlusCircle size={20} /> Create New Topic</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            name="title"
            value={newTopic.title}
            onChange={handleInputChange}
            placeholder="Topic Title"
            required
          />
          <select
            name="category"
            value={newTopic.category}
            onChange={handleInputChange}
            required
          >
            <option value="">Select Category</option>
            {categories.filter(cat => cat !== 'All').map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <textarea
            name="content"
            value={newTopic.content}
            onChange={handleInputChange}
            placeholder="Topic Content"
            required
          ></textarea>
          <button type="submit" className="btn btn-primary">Create Topic</button>
        </form>
      </div>
    </div>
  );
};

export default Forum;