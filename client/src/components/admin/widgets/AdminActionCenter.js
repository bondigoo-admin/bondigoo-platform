import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const AdminActionCenter = ({ items, isLoading }) => {
  const { t } = useTranslation(['admin']);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('actionCenter.title', 'Action Center')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
            <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
            </div>
        ) : (
        <ul className="space-y-2">
          {items?.map((item, index) => (
            <li key={index} className="flex items-center justify-between">
              <span className="text-sm font-medium">{item.title}</span>
              <Button asChild variant="ghost" size="sm">
                <Link to={item.link}>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminActionCenter;