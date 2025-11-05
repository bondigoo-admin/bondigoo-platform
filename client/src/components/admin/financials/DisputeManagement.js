import React, { useState, useMemo, useEffect } from 'react';
import { useAdminDisputes } from '../../../hooks/useAdmin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../../ui/table.tsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { de, fr, es } from 'date-fns/locale';
import { Skeleton } from '../../ui/skeleton.jsx';
import { ArrowRight, ArrowUp, ArrowDown } from 'lucide-react';
import { Badge } from '../../ui/badge.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx';
import { Label } from '../../ui/label.tsx';

const localeMap = {
  de,
  fr,
  es,
};

const DisputeManagement = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['admin', 'common']);
    
    const [sortConfig, setSortConfig] = useState({
        key: searchParams.get('sortKey') || 'updatedAt',
        direction: searchParams.get('sortDirection') || 'desc',
    });
    const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');

    const { data: disputesData, isLoading, isError } = useAdminDisputes({
        status: statusFilter,
        sortKey: sortConfig.key,
        sortDirection: sortConfig.direction,
    });

    const disputes = useMemo(() => Array.isArray(disputesData) ? disputesData : disputesData?.tickets, [disputesData]);
    const currentLocale = localeMap[i18n.language];

    const handleRowClick = (ticketId) => {
        navigate(`/admin/financials/disputes/${ticketId}`);
    };

    useEffect(() => {
        const params = {
            status: statusFilter,
            sortKey: sortConfig.key,
            sortDirection: sortConfig.direction,
        };
        setSearchParams(params, { replace: true });
    }, [statusFilter, sortConfig, setSearchParams]);

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const totalRefundedAmount = useMemo(() => {
        if (!disputes) return 0;
        return disputes.reduce((acc, ticket) => {
            if (ticket.resolution?.action === 'refund_approved' && ticket.resolution?.finalRefundAmount) {
                return acc + ticket.resolution.finalRefundAmount;
            }
            return acc;
        }, 0);
    }, [disputes]);

    const getStatusBadge = (status) => {
        switch (status) {
            case 'escalated_to_admin':
                return <Badge variant="destructive">{t(`financials.statuses.${status}`, 'Escalated')}</Badge>;
            case 'closed':
                return <Badge variant="success">{t(`financials.statuses.${status}`, 'Closed')}</Badge>;
            case 'resolved':
            case 'resolved_by_coach':
                return <Badge variant="outline">{t(`financials.statuses.${status}`, 'Resolved')}</Badge>;
            default:
                return <Badge variant="secondary">{t(`financials.statuses.${status}`, status)}</Badge>;
        }
    };

    const SortableHeader = ({ children, sortKey }) => {
        const isSorted = sortConfig.key === sortKey;
        const Icon = sortConfig.direction === 'asc' ? ArrowUp : ArrowDown;
        return (
            <TableHead onClick={() => handleSort(sortKey)} className="cursor-pointer hover:bg-muted/50">
                <div className="flex items-center gap-2">
                    {children}
                    {isSorted && <Icon className="h-4 w-4" />}
                </div>
            </TableHead>
        );
    };

    if (isError) {
        return <div className="text-destructive p-4">{t('common:error.generic')}</div>;
    }

    return (
        <div className="space-y-4">
             <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold tracking-tight">{t('financials.disputeQueueTitle', 'Dispute Resolution Queue')}</h2>
                <div className="flex items-center gap-2">
                    <Label htmlFor="status-filter">{t('common:status')}</Label>
                     <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger id="status-filter" className="w-[180px]">
                            <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('common:all', 'All')}</SelectItem>
                            <SelectItem value="escalated_to_admin">{t('financials.statuses.escalated_to_admin', 'Escalated')}</SelectItem>
                            <SelectItem value="closed">{t('financials.statuses.closed', 'Closed')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <SortableHeader sortKey="booking.title">{t('financials.disputes.booking', 'Booking')}</SortableHeader>
                            <TableHead className="hidden sm:table-cell">{t('financials.disputes.participants', 'Participants')}</TableHead>
                            <SortableHeader sortKey="updatedAt">{t('financials.disputes.lastUpdated', 'Last Updated')}</SortableHeader>
                            <SortableHeader sortKey="status">{t('common:status', 'Status')}</SortableHeader>
                            <SortableHeader sortKey="requestedRefundAmount.amount">{t('financials.disputes.amount', 'Amount')}</SortableHeader>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-5 w-3/4" /></TableCell>
                                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-2/4" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-3/4" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                                    <TableCell className="text-right"><Skeleton className="h-5 w-1/4 ml-auto" /></TableCell>
                                </TableRow>
                            ))
                        ) : disputes?.length > 0 ? (
                            disputes.map(ticket => (
                                <TableRow key={ticket._id} onClick={() => handleRowClick(ticket._id)} className="cursor-pointer hover:bg-muted/50">
                                    <TableCell className="font-medium">{ticket.booking?.title || 'N/A'}</TableCell>
                                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                                        <div className="flex items-center gap-1.5">
                                            <span>{ticket.user ? `${ticket.user.firstName} ${ticket.user.lastName}` : 'N/A'}</span>
                                            <ArrowRight className="h-3 w-3 shrink-0" />
                                            <span>{ticket.booking?.coach ? `${ticket.booking.coach.firstName} ${ticket.booking.coach.lastName}` : 'N/A'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>{format(new Date(ticket.updatedAt), 'dd.MM.yy p', { locale: currentLocale })}</TableCell>
                                    <TableCell>
                                        {getStatusBadge(ticket.status)}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {ticket.requestedRefundAmount?.amount != null ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: ticket.requestedRefundAmount.currency || 'CHF' }).format(ticket.requestedRefundAmount.amount) : 'N/A'}
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    {t('financials.disputes.noDisputes', 'No disputes found for the selected filter.')}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                    <TableFooter>
                        <TableRow>
                            <TableCell colSpan={4} className="text-right font-bold">{t('financials.totalRefunded', 'Total Approved & Refunded')}:</TableCell>
                            <TableCell className="text-right font-bold">
                                {new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(totalRefundedAmount)}
                            </TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </div>
        </div>
    );
};

export default DisputeManagement;