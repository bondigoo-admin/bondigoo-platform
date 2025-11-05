import React, { useState } from 'react';
import TranslationOverviewDashboard from '../../TranslationOverviewDashboard';
import TranslationManagement from '../../TranslationManagement';

const AdminTranslationsTab = () => {
    const [selectedListType, setSelectedListType] = useState('');

    return (
        <div className="space-y-6">
            <TranslationOverviewDashboard 
                onListTypeSelect={setSelectedListType} 
                activeListType={selectedListType}
            />
            <TranslationManagement selectedListTypeFromParent={selectedListType} />
        </div>
    );
};

export default AdminTranslationsTab;