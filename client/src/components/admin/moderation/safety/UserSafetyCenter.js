import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../ui/button.tsx';
import AtRiskUsers from './AtRiskUsers';
import BlockedPairsManagement from './BlockedPairsManagement';

const UserSafetyCenter = () => {
    const { t } = useTranslation(['admin']);
    const [activeView, setActiveView] = useState('at_risk');

    return (
        <div className="space-y-4">
            <div className="flex space-x-2 border-b">
                <Button
                    variant={activeView === 'at_risk' ? 'secondary' : 'ghost'}
                    onClick={() => setActiveView('at_risk')}
                    className="rounded-b-none"
                >
                    {t('moderation.safety.atRiskUsers')}
                </Button>
                <Button
                    variant={activeView === 'blocked_pairs' ? 'secondary' : 'ghost'}
                    onClick={() => setActiveView('blocked_pairs')}
                    className="rounded-b-none"
                >
                    {t('moderation.safety.blockedPairs')}
                </Button>
            </div>
            <div>
                {activeView === 'at_risk' && <AtRiskUsers />}
                {activeView === 'blocked_pairs' && <BlockedPairsManagement />}
            </div>
        </div>
    );
};

export default UserSafetyCenter;