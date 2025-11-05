import React, { useState } from 'react';

const AddResource = () => {
  const [resource, setResource] = useState({
    title: '',
    category: '',
    type: '',
    content: ''
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setResource({ ...resource, [name]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // In a real app, you would send this data to your API
    console.log('New resource:', resource);
    // Reset form
    setResource({ title: '', category: '', type: '', content: '' });
  };

  return (
    <div className="add-resource">
      <h2>Add New Resource</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="title">Title:</label>
          <input
            type="text"
            id="title"
            name="title"
            value={resource.title}
            onChange={handleInputChange}
            required
          />
        </div>
        <div>
          <label htmlFor="category">Category:</label>
          <input
            type="text"
            id="category"
            name="category"
            value={resource.category}
            onChange={handleInputChange}
            required
          />
        </div>
        <div>
          <label htmlFor="type">Type:</label>
          <select
            id="type"
            name="type"
            value={resource.type}
            onChange={handleInputChange}
            required
          >
            <option value="">Select Type</option>
            <option value="Article">Article</option>
            <option value="Video">Video</option>
            <option value="Podcast">Podcast</option>
          </select>
        </div>
        <div>
          <label htmlFor="content">Content:</label>
          <textarea
            id="content"
            name="content"
            value={resource.content}
            onChange={handleInputChange}
            required
          />
        </div>
        <button type="submit">Add Resource</button>
      </form>
    </div>
  );
};

export default AddResource;