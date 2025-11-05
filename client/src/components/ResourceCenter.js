import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, BookOpen, Video, Headphones, FileText, 
  Download, Star, Tag, Calendar, User, List, Grid
} from 'lucide-react';

const ResourceCenter = () => {
  const [resources, setResources] = useState([]);
  const [filteredResources, setFilteredResources] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [sortBy, setSortBy] = useState('dateAdded');
  const [viewMode, setViewMode] = useState('grid');

  useEffect(() => {
    fetchResources();
  }, []);

  const fetchResources = () => {
    // Simulated API call
    setTimeout(() => {
      setResources([
        { id: 1, title: 'Effective Communication Strategies', category: 'Soft Skills', type: 'Article', rating: 4.5, author: 'Jane Doe', dateAdded: '2024-08-15', downloads: 120 },
        { id: 2, title: 'Time Management Techniques', category: 'Productivity', type: 'Video', rating: 4.2, author: 'John Smith', dateAdded: '2024-08-14', downloads: 85 },
        { id: 3, title: 'Leadership in the 21st Century', category: 'Leadership', type: 'Podcast', rating: 4.8, author: 'Alice Johnson', dateAdded: '2024-08-13', downloads: 200 },
        { id: 4, title: 'Mastering Public Speaking', category: 'Soft Skills', type: 'Course', rating: 4.6, author: 'Bob Williams', dateAdded: '2024-08-12', downloads: 150 },
        { id: 5, title: 'Data-Driven Decision Making', category: 'Business', type: 'eBook', rating: 4.3, author: 'Carol Brown', dateAdded: '2024-08-11', downloads: 95 },
      ]);
    }, 500);
  };

  const filterAndSortResources = useCallback(() => {
    let filtered = resources.filter(resource => 
      (selectedCategory === 'All' || resource.category === selectedCategory) &&
      (selectedType === 'All' || resource.type === selectedType) &&
      (resource.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
       resource.author.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    filtered.sort((a, b) => {
      switch(sortBy) {
        case 'dateAdded':
          return new Date(b.dateAdded) - new Date(a.dateAdded);
        case 'rating':
          return b.rating - a.rating;
        case 'downloads':
          return b.downloads - a.downloads;
        default:
          return 0;
      }
    });

    setFilteredResources(filtered);
  }, [resources, searchTerm, selectedCategory, selectedType, sortBy]);

  useEffect(() => {
    filterAndSortResources();
  }, [filterAndSortResources]);

  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  const getResourceIcon = (type) => {
    switch(type) {
      case 'Article': return <FileText size={24} />;
      case 'Video': return <Video size={24} />;
      case 'Podcast': return <Headphones size={24} />;
      case 'Course': return <BookOpen size={24} />;
      case 'eBook': return <BookOpen size={24} />;
      default: return <FileText size={24} />;
    }
  };

  return (
    <div className="resource-center-component">
      <h2><BookOpen size={24} /> Resource Center</h2>
      
      <div className="resource-controls">
        <div className="search-bar">
          <Search size={20} />
          <input 
            type="text" 
            placeholder="Search resources..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-section">
          <select 
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="All">All Categories</option>
            <option value="Soft Skills">Soft Skills</option>
            <option value="Productivity">Productivity</option>
            <option value="Leadership">Leadership</option>
            <option value="Business">Business</option>
          </select>
          <select 
            value={selectedType} 
            onChange={(e) => setSelectedType(e.target.value)}
          >
            <option value="All">All Types</option>
            <option value="Article">Article</option>
            <option value="Video">Video</option>
            <option value="Podcast">Podcast</option>
            <option value="Course">Course</option>
            <option value="eBook">eBook</option>
          </select>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="dateAdded">Latest</option>
            <option value="rating">Top Rated</option>
            <option value="downloads">Most Downloaded</option>
          </select>
        </div>
        <div className="view-toggle">
          <button onClick={() => setViewMode('grid')} className={viewMode === 'grid' ? 'active' : ''}>
            <Grid size={20} />
          </button>
          <button onClick={() => setViewMode('list')} className={viewMode === 'list' ? 'active' : ''}>
            <List size={20} />
          </button>
        </div>
      </div>

      <div className={`resource-list ${viewMode}`}>
        {filteredResources.map(resource => (
          <div key={resource.id} className="resource-item">
            <div className="resource-icon">
              {getResourceIcon(resource.type)}
            </div>
            <div className="resource-info">
              <h3>{resource.title}</h3>
              <div className="resource-meta">
                <div><Tag size={16} /> {resource.category}</div>
                <div><User size={16} /> {resource.author}</div>
                <div><Calendar size={16} /> {formatDate(resource.dateAdded)}</div>
              </div>
              <div className="resource-rating">
                <Star size={16} fill="#ffc107" />
                <span>{resource.rating.toFixed(1)}</span>
                <span className="downloads">({resource.downloads} downloads)</span>
              </div>
            </div>
            <button className="download-btn">
              <Download size={16} /> Access
            </button>
          </div>
        ))}
        {filteredResources.length === 0 && (
          <p className="no-results">No resources found matching your criteria.</p>
        )}
      </div>
    </div>
  );
};

export default ResourceCenter;