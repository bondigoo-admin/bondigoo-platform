import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminVerificationQueue } from '../../../../hooks/useAdmin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../ui/table.tsx';
import { Badge } from '../../../ui/badge.tsx';
import { Button } from '../../../ui/button.tsx';
import { Skeleton } from '../../../ui/skeleton.jsx';
import { format } from 'date-fns';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../ui/dropdown-menu.tsx';
import { MoreHorizontal } from 'lucide-react';
import VerificationDetailModal from './VerificationDetailModal';

const VerificationQueue = () => {
    const { t } = useTranslation(['admin']);
    const [filters, setFilters] = useState({ page: 1, limit: 15 });
    const { data, isLoading } = useAdminVerificationQueue(filters);
    const [selectedRequest, setSelectedRequest] = useState(null);

    const items = data?.items || [];

    return (
        <div className="border rounded-lg">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t('moderation.verifications.coach')}</TableHead>
                        <TableHead>{t('moderation.verifications.registry')}</TableHead>
                        <TableHead>{t('moderation.verifications.submitted')}</TableHead>
                        <TableHead className="text-right">{t('common:actions')}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading ? (
                        Array.from({ length: 10 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell>
                            </TableRow>
                        ))
                    ) : items.length > 0 ? (
                        items.map((item, index) => (
                            <TableRow key={`${item.coach._id}-${item.registry.name}-${index}`}>
                                <TableCell className="font-medium">{item.coach.firstName} {item.coach.lastName}</TableCell>
                                <TableCell>{item.registry.name}</TableCell>
                                <TableCell>{format(new Date(item.registry.submittedAt), 'PPpp')}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <span className="sr-only">Open menu</span>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => setSelectedRequest(item)}>
                                                {t('common:manage')}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center">{t('moderation.verifications.noPending')}</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
             {selectedRequest && (
                <VerificationDetailModal
                    request={selectedRequest}
                    isOpen={!!selectedRequest}
                    onClose={() => setSelectedRequest(null)}
                />
            )}
        </div>
    );
};

export default VerificationQueue;