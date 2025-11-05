import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAdminPrograms, useUpdateProgramByAdmin } from '../../../hooks/useAdmin';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../ui/table.tsx';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '../../ui/pagination.jsx';
import { Input } from '../../ui/input.tsx';
import { Button } from '../../ui/button.tsx';
import { Badge } from '../../ui/badge.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { Switch } from '../../ui/switch.tsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../ui/alert-dialog.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx';
import { Star, MoreHorizontal, ExternalLink, Edit } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../ui/dropdown-menu.tsx';
import { toast } from 'react-hot-toast';

const AdminProgramManagement = () => {
    const { t } = useTranslation(['admin', 'common']);
    const [filters, setFilters] = useState({ page: 1, limit: 10, sortField: 'createdAt', sortOrder: 'desc', search: '' });

    const { data, isLoading } = useAdminPrograms(filters);
     const [statusModalState, setStatusModalState] = useState({ isOpen: false, program: null, newStatus: '' });

    const openStatusModal = (program) => {
        setStatusModalState({ isOpen: true, program: program, newStatus: program.status });
    };

    const handleStatusChange = () => {
        if (!statusModalState.program) return;
        updateProgramMutation.mutate({ 
            programId: statusModalState.program._id, 
            updateData: { status: statusModalState.newStatus } 
        }, {
            onSuccess: () => {
                toast.success(t('platform.programUpdated', 'Program updated successfully.'));
                setStatusModalState({ isOpen: false, program: null, newStatus: '' });
            },
            onError: (err) => toast.error(err.response?.data?.message || t('common:error.generic')),
        });
    };
    const updateProgramMutation = useUpdateProgramByAdmin();

    const handleSearchChange = (event) => {
        setFilters(prev => ({ ...prev, search: event.target.value, page: 1 }));
    };
    
    const handleFeatureToggle = (programId, currentStatus) => {
        updateProgramMutation.mutate({ programId, updateData: { isFeatured: !currentStatus } }, {
            onSuccess: () => toast.success(t('platform.programUpdated', 'Program updated successfully.')),
            onError: (err) => toast.error(err.response?.data?.message || t('common:error.generic')),
        });
    };

    const formatCurrency = (value) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(value || 0);
    const getStatusVariant = (status) => ({ published: 'success', draft: 'secondary', archived: 'outline' }[status] || 'outline');

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <Input
                    placeholder={t('platform.searchPlaceholder', 'Search by program or coach...')}
                    value={filters.search}
                    onChange={handleSearchChange}
                    className="max-w-sm"
                />
            </div>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('platform.table.program', 'Program')}</TableHead>
                            <TableHead>{t('platform.table.coach', 'Coach')}</TableHead>
                            <TableHead className="hidden md:table-cell">{t('platform.table.stats', 'Stats')}</TableHead>
                            <TableHead className="hidden lg:table-cell">{t('platform.table.status', 'Status')}</TableHead>
                            <TableHead>{t('platform.table.featured', 'Featured')}</TableHead>
                            <TableHead className="text-right">{t('platform.table.actions', 'Actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: filters.limit }).map((_, i) => (
                                <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                            ))
                        ) : data?.programs?.length > 0 ? (
                            data.programs.map(p => (
                               <TableRow key={p._id}>
                                    <TableCell className="font-medium">{p.title}</TableCell>
                                    <TableCell>
                                        <Button variant="link" asChild className="p-0 h-auto font-normal">
                                            <Link to={`/coach/${p.coachId}`}>{p.coachName}</Link>
                                        </Button>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                                        <div className="flex flex-col">
                                            <span>{t('platform.enrollments', 'Enrollments: {{count}}', { count: p.totalEnrollments })}</span>
                                            <span>{t('platform.revenue', 'Revenue: {{amount}}', { amount: formatCurrency(p.grossRevenue) })}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell">
                                        <Badge variant={getStatusVariant(p.status)}>{t(`platform.statuses.${p.status}`, p.status)}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Switch
                                            checked={p.isFeatured}
                                            onCheckedChange={() => handleFeatureToggle(p._id, p.isFeatured)}
                                            disabled={updateProgramMutation.isLoading}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem asChild>
                                                    <a href={`/programs/${p._id}`} target="_blank" rel="noopener noreferrer">
                                                        <ExternalLink className="mr-2 h-4 w-4" />
                                                        {t('platform.actions.viewFrontend', 'View on Frontend')}
                                                    </a>
                                                </DropdownMenuItem>
                                               {/*<DropdownMenuItem asChild>
                                                    <Link to={`/coach/${p.coachId}/programs`}>
                                                        <Edit className="mr-2 h-4 w-4" />
                                                        {t('platform.actions.viewCreator', 'View in Creator Studio')}
                                                    </Link>
                                                </DropdownMenuItem>*/}
                                                <DropdownMenuItem onClick={() => openStatusModal(p)}>
                                                    <Edit className="mr-2 h-4 w-4" />
                                                    {t('platform.actions.changeStatus', 'Change Status')}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow><TableCell colSpan={6} className="h-24 text-center">{t('platform.noPrograms', 'No programs found.')}</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
             {data?.totalPages > 1 && (
                <Pagination>
                    <PaginationContent>
                        <PaginationItem><PaginationPrevious onClick={() => setFilters(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))} disabled={filters.page === 1 || isLoading} /></PaginationItem>
                        <PaginationItem><span className="px-4 py-2 text-sm">{t('common:pageNumber', { current: data.currentPage, total: data.totalPages })}</span></PaginationItem>
                        <PaginationItem><PaginationNext onClick={() => setFilters(prev => ({ ...prev, page: Math.min(data.totalPages, prev.page + 1) }))} disabled={filters.page === data.totalPages || isLoading} /></PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}
            <AlertDialog open={statusModalState.isOpen} onOpenChange={(isOpen) => setStatusModalState(prev => ({ ...prev, isOpen }))}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('platform.changeStatusTitle', 'Change Program Status')}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('platform.changeStatusDesc', 'Select a new status for the program "{{title}}".', { title: statusModalState.program?.title })}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                    <Select value={statusModalState.newStatus} onValueChange={(value) => setStatusModalState(prev => ({ ...prev, newStatus: value }))}>
                        <SelectTrigger>
                            <SelectValue placeholder={t('platform.selectStatus', 'Select a status')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="published">{t('platform.statuses.published', 'Published')}</SelectItem>
                            <SelectItem value="draft">{t('platform.statuses.draft', 'Draft')}</SelectItem>
                            <SelectItem value="archived">{t('platform.statuses.archived', 'Archived')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleStatusChange} disabled={updateProgramMutation.isLoading || statusModalState.newStatus === statusModalState.program?.status}>
                        {t('common:save')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </div>
    );
};

export default AdminProgramManagement;