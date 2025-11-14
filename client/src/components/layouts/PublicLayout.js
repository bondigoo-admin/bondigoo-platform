import React from 'react';
import { Outlet } from 'react-router-dom';

const PublicLayout = () => {
    return (
        <>
            <Outlet />
            {/* Footer logic is now handled globally in App.js to prevent duplication. */}
        </>
    );
};

export default PublicLayout;