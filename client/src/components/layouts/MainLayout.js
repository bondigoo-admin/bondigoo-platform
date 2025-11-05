import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../Header';

const MainLayout = () => {
  return (
    <div className="flex flex-col h-screen bg-background">
      <Header />
      <main className="flex-1 overflow-y-auto relative">
        <Outlet /> {/* Child routes will render here */}
      </main>
    </div>
  );
};

export default MainLayout;