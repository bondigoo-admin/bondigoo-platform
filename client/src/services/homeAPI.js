import api, { fileApi } from './api';

export const fetchFeaturedTestimonials = async () => {
  await new Promise(resolve => setTimeout(resolve, 1200));
  return [
    { _id: 't1', quote: "This platform completely changed my career trajectory. My coach was phenomenal!", author: 'Jessica Miller', role: 'Senior Product Manager', avatarUrl: 'https://i.pravatar.cc/150?u=a042581f4e29026704d' },
    { _id: 't2', quote: "As a coach, the tools here are second to none. I've doubled my client base in six months.", author: 'David Lee', role: 'Executive Coach', avatarUrl: 'https://i.pravatar.cc/150?u=a042581f4e29026705d' },
    { _id: 't3', quote: "The programs are incredibly insightful. I've learned skills that I apply every single day.", author: 'Sarah Johnson', role: 'Startup Founder', avatarUrl: 'https://i.pravatar.cc/150?u=a042581f4e29026706d' },
  ];
};

export const fetchPlatformStats = async () => {
  await new Promise(resolve => setTimeout(resolve, 800));
  return { coaches: 450, sessions: 25000, users: 15000 };
};