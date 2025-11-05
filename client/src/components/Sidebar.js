import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AuthContext } from '../contexts/AuthContext';
import { 
  Home, 
  User, 
  Users, 
  MessageSquare, 
  Calendar, 
  BookOpen, 
  TrendingUp, 
  Settings, 
  LogOut
} from 'lucide-react';

const menuItems = {
  user: [
    { title: 'Home', icon: Home, path: '/' },
    { title: 'Profile', icon: User, path: '/profile' },
    { title: 'Coaches', icon: Users, path: '/coaches' },
    { title: 'Messages', icon: MessageSquare, path: '/messages' },
    { title: 'Upcoming Sessions', icon: Calendar, path: '/upcoming-sessions' },
    { title: 'Resources', icon: BookOpen, path: '/resources' },
  ],
  coach: [
    { title: 'Home', icon: Home, path: '/' },
    { title: 'Profile', icon: User, path: '/profile' },
    { title: 'Messages', icon: MessageSquare, path: '/messages' },
    { title: 'Manage Sessions', icon: Calendar, path: '/manage-sessions' },
    { title: 'Resources', icon: BookOpen, path: '/resources' },
    { title: 'Analytics', icon: TrendingUp, path: '/analytics' },
  ],
  admin: [
    { title: 'Dashboard', icon: Home, path: '/dashboard' },
    { title: 'Users', icon: Users, path: '/users' },
    { title: 'Analytics', icon: TrendingUp, path: '/analytics' },
    { title: 'Settings', icon: Settings, path: '/settings' },
  ],
  default: [
    { title: 'Home', icon: Home, path: '/' },
    { title: 'Login', icon: User, path: '/login' },
    { title: 'Sign Up', icon: Users, path: '/signup' },
  ],
};

const Sidebar = () => {
  const { userRole, logout, isAuthenticated } = useContext(AuthContext);

  const sidebarVariants = {
    open: { x: 0 },
    closed: { x: '-100%' },
  };

  const currentMenuItems = isAuthenticated && userRole ? menuItems[userRole] : menuItems.default;

  return (
    <motion.nav
      className="sidebar bg-gray-800 text-white w-64 min-h-screen p-4"
      initial="closed"
      animate="open"
      variants={sidebarVariants}
    >
      <div className="flex flex-col h-full">
        <div className="flex-grow">
          {currentMenuItems.map((item, index) => (
            <Link
              key={index}
              to={item.path}
              className="flex items-center py-2 px-4 rounded hover:bg-gray-700 transition-colors duration-200"
            >
              <item.icon className="mr-3" size={18} />
              <span>{item.title}</span>
            </Link>
          ))}
        </div>
        {isAuthenticated && (
          <button
            onClick={logout}
            className="flex items-center py-2 px-4 rounded hover:bg-gray-700 transition-colors duration-200 mt-auto"
          >
            <LogOut className="mr-3" size={18} />
            <span>Logout</span>
          </button>
        )}
      </div>
    </motion.nav>
  );
};

export default Sidebar;