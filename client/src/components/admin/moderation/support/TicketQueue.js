import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminSupportTickets } from '../../../../hooks/useAdmin';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../../ui/table.tsx';
import { Badge } from '../../../ui/badge.tsx';
import { Skeleton } from '../../../ui/skeleton.jsx';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../../../ui/button.tsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const TicketQueue = ({ onTicketSelect, selectedTicketId }) => {
    const { t } = useTranslation(['admin', 'common']);
    const [filters, setFilters] = useState({ page: 1, limit: 15 });
    const { data, isLoading } = useAdminSupportTickets(filters);
    
    const tickets = data?.tickets || [];
    const totalPages = data?.totalPages || 1;

    const getStatusVariant = (status) => ({
        open: 'success',
        in_progress: 'default',
        closed: 'outline',
        resolved: 'secondary'
    }[status] || 'outline');

    return (
        <div className="flex flex-col h-full bg-card md:rounded-lg md:border">
            {/* Mobile View */}
            <div className="md:hidden flex-grow overflow-auto p-4 space-y-3">
                 {isLoading ? (
                    Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)
                ) : tickets.length > 0 ? (
                    tickets.map(ticket => (
                        <div 
                            key={ticket._id} 
                            onClick={() => onTicketSelect(ticket._id)} 
                            className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedTicketId === ticket._id ? 'bg-muted dark:bg-zinc-800' : 'hover:bg-muted/50'}`}
                        >
                            <div className="flex justify-between items-start">
                                <p className="font-semibold pr-2">{ticket.subject}</p>
                                <Badge variant={getStatusVariant(ticket.status)} className="flex-shrink-0">{ticket.status}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-2 flex justify-between">
                                <span>{ticket.user?.firstName} {ticket.user?.lastName}</span>
                                <span>{formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}</span>
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="text-center text-muted-foreground py-10">{t('moderation.support.noTickets')}</p>
                )}
            </div>
            
            {/* Desktop View */}
            <div className="hidden md:block flex-grow overflow-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50%]">{t('moderation.support.table.subject')}</TableHead>
                            <TableHead>{t('moderation.support.table.user')}</TableHead>
                            <TableHead>{t('common:status')}</TableHead>
                            <TableHead>{t('moderation.support.table.updated')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 15 }).map((_, i) => (
                                <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                            ))
                        ) : tickets.length > 0 ? (
                            tickets.map(ticket => (
                                <TableRow 
                                    key={ticket._id} 
                                    onClick={() => onTicketSelect(ticket._id)} 
                                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedTicketId === ticket._id ? 'bg-muted dark:bg-zinc-800' : ''}`}
                                >
                                    <TableCell className="font-medium">{ticket.subject}</TableCell>
                                    <TableCell>{ticket.user?.firstName} {ticket.user?.lastName}</TableCell>
                                    <TableCell><Badge variant={getStatusVariant(ticket.status)}>{ticket.status}</Badge></TableCell>
                                    <TableCell>{formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow><TableCell colSpan={4} className="h-24 text-center">{t('moderation.support.noTickets')}</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-between p-4 border-t">
              <div className="text-sm text-muted-foreground">
                Page {data?.currentPage || 1} of {totalPages}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilters(prev => ({ ...prev, page: Math.max(prev.page - 1, 1) }))}
                  disabled={filters.page === 1 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilters(prev => ({ ...prev, page: Math.min(prev.page + 1, totalPages) }))}
                  disabled={filters.page === totalPages || isLoading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
        </div>
    );
};

export default TicketQueue;