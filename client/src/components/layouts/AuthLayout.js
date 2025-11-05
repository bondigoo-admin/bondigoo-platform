import React from 'react';
import { Outlet } from 'react-router-dom';

const AuthLayout = () => {

  return (
    <main className="min-h-screen w-full bg-secondary">
      <Outlet />
    </main>
  );
};

export default AuthLayout;