import React from 'react';
import { Outlet } from 'react-router-dom';
import MainFooter from '../MainFooter';
import SubFooter from './SubFooter';

const PublicLayout = () => {
    const isLaunched = process.env.REACT_APP_LAUNCHED === 'true';

    return (
        <>
            <Outlet />
            {isLaunched ? <MainFooter /> : <SubFooter />}
        </>
    );
};

export default PublicLayout;