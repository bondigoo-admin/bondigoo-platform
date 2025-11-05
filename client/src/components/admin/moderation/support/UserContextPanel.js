import React from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback } from '../../../ui/avatar.tsx';
import { Badge } from '../../../ui/badge.tsx';
import { Button } from '../../../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card.tsx';
import { Separator } from '../../../ui/separator.jsx';
import { ExternalLink, User, Banknote, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../../../contexts/AuthContext';

const UserContextPanel = ({ user }) => {
    const { t } = useTranslation(['admin', 'common']);
    const { user: loggedInUser } = useAuth();

    if (!user) {
        return (
            <Card>
                <CardContent className="flex h-full items-center justify-center p-6">
                    <p className="text-sm text-muted-foreground">{t('moderation.support.noUserContext')}</p>
                </CardContent>
            </Card>
        );
    }

    const handleProfileNavigation = (e, targetUser) => {
        e.preventDefault();
        if (!targetUser?._id) return;
        
        let targetUrl;
        if (loggedInUser?._id === targetUser._id) {
            targetUrl = '/profile';
        } else if (targetUser.role === 'coach') {
            targetUrl = `/coach/${targetUser._id}`;
        } else {
            targetUrl = `/profile/${targetUser._id}`;
        }
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
    };
    
    const getTrustScoreVariant = (score) => {
        if (score < 30) return 'destructive';
        if (score < 60) return 'warning';
        return 'success';
    };

    const formatCurrency = (amount, currency) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: currency || 'CHF' }).format(amount || 0);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('moderation.support.userContext')}</CardTitle>
                 <Button asChild variant="ghost" size="icon" className="h-6 w-6">
                    <a href={`/admin/users?search=${user.email}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                    </a>
                </Button>
            </CardHeader>
            <CardContent>
                <div className="flex items-center space-x-4 pt-2">
                    <Avatar className="h-12 w-12">
                        <AvatarFallback>{user.firstName?.[0]}{user.lastName?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold truncate">{user.firstName} {user.lastName}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                </div>
                <Separator className="my-4" />
                <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t('moderation.support.memberSince')}</span>
                        <span className="font-medium">{format(new Date(user.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t('moderation.support.ltv')}</span>
                        <span className="font-medium">{formatCurrency(user.ltv?.amount, user.ltv?.currency)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t('moderation.support.warnings')}</span>
                        <span className="font-medium">{user.warningCount ?? user.moderation?.warningsCount ?? 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t('moderation.support.trustScore')}</span>
                        <Badge variant={getTrustScoreVariant(user.trustScore)}>{user.trustScore}</Badge>
                    </div>
                </div>
                 <Separator className="my-4" />
                 <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={(e) => handleProfileNavigation(e, user)}>
                        <User className="mr-2 h-3 w-3" /> {t('common:profile')}
                    </Button>
                     <Button asChild variant="outline" size="sm">
                        <a href={`/admin/financials?search=${user.email}`} target="_blank" rel="noopener noreferrer">
                            <Banknote className="mr-2 h-3 w-3" /> {t('common:ledger')}
                        </a>
                    </Button>
                 </div>
            </CardContent>
        </Card>
    );
};

export default UserContextPanel;