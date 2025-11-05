import React from 'react';
import { Outlet } from 'react-router-dom';
import MainFooter from '../MainFooter';

const PublicLayout = () => {
  return (
    <>
      <Outlet /> {/* This will render the specific page component like Home or HowItWorks */}
      <MainFooter />
    </>
  );
};

export default PublicLayout;