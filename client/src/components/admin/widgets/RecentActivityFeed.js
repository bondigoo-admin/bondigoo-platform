import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card.tsx';
import { useTranslation } from 'react-i18next';

const RecentActivityFeed = () => {
  const { t } = useTranslation(['admin']);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('recentActivity.title', 'Recent Activity')}</CardTitle>
        <CardDescription>{t('recentActivity.desc', 'A feed of recent platform events.')}</CardDescription>
      </CardHeader>
      <CardContent>
        <p>{t('common:comingSoon', 'Coming Soon...')}</p>
      </CardContent>
    </Card>
  );
};

export default RecentActivityFeed;