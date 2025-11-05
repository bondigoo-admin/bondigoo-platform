import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../../../ui/input.tsx';
import { Slider } from '../../../ui/slider.tsx';
import { Card, CardContent } from '../../../ui/card.tsx';
import UserMasterTable from '../../user-management/UserMasterTable';
import { debounce } from 'lodash';

const AtRiskUsers = () => {
    const { t } = useTranslation(['admin']);
    const [filters, setFilters] = useState({
        page: 1,
        limit: 15,
        sortField: 'trustScore',
        sortOrder: 'asc',
        minTrust: 0,
        maxTrust: 50,
        minBlockedByCount: 5,
    });

    const [trustRange, setTrustRange] = useState([0, 50]);
    const [minBlocked, setMinBlocked] = useState(5);

    useEffect(() => {
        const debouncedUpdate = debounce(() => {
            setFilters(prev => ({
                ...prev,
                minTrust: trustRange[0],
                maxTrust: trustRange[1],
                minBlockedByCount: minBlocked || 0,
                page: 1,
            }));
        }, 500);
        debouncedUpdate();
        return () => debouncedUpdate.cancel();
    }, [trustRange, minBlocked]);

    const handleUserSelect = (userId) => {
        // In a future step, this could open the detail sheet.
        console.log("Selected user for detail view:", userId);
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">
                            {t('moderation.safety.trustScoreFilter', 'Trust Score Range: {{min}} - {{max}}', { min: trustRange[0], max: trustRange[1] })}
                        </label>
                        <Slider
                            value={trustRange}
                            onValueChange={setTrustRange}
                            max={100}
                            step={5}
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="min-blocked" className="text-sm font-medium text-muted-foreground">
                             {t('moderation.safety.minBlockedFilter', 'Minimum Times Blocked By Others')}
                        </label>
                        <Input
                            id="min-blocked"
                            type="number"
                            value={minBlocked}
                            onChange={(e) => setMinBlocked(e.target.value)}
                            placeholder="e.g., 5"
                        />
                    </div>
                </CardContent>
            </Card>
            <UserMasterTable
                onUserSelect={handleUserSelect}
                filters={filters}
                setFilters={setFilters}
            />
        </div>
    );
};

export default AtRiskUsers;