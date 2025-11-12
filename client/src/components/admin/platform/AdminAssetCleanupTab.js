import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { useAdminOrphanedAssets, useDeleteOrphanedAssets } from '../../../hooks/useAdmin';
import { Button } from '../../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../../ui/card.tsx';
import { Checkbox } from '../../ui/checkbox.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../ui/alert-dialog.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '../../ui/pagination.jsx';
import { Badge } from '../../ui/badge.tsx';

const ASSET_TYPES = [
    'profile_picture', 'program_asset', 'assignment_submission', 'session_recording',
    'session_resource', 'user_background', 'coach_verification_doc', 'b2b_invoice',
    'coach_application_doc', 'feedback_attachment', 'session_image', 'unknown'
];

const SortableHeader = ({ children, field, currentSort, onSort }) => {
    const { sortField, sortOrder } = currentSort;
    const isCurrent = sortField === field;
    const Icon = isCurrent ? (sortOrder === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;

    return (
        <TableHead>
            <Button variant="outline" onClick={() => onSort(field)} className="px-2 py-1 h-auto">
                {children}
                <Icon className="ml-2 h-4 w-4" />
            </Button>
        </TableHead>
    );
};

const AdminAssetCleanupTab = () => {
    const { t } = useTranslation(['admin', 'common']);
    const [filters, setFilters] = useState({ page: 1, limit: 15, sortField: 'fileSize', sortOrder: 'desc', resourceType: '', assetType: '' });
    const [selected, setSelected] = useState(new Set());
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);

    const { data, isLoading, isError } = useAdminOrphanedAssets(filters);
    const deleteMutation = useDeleteOrphanedAssets();

    const handleSort = (field) => {
        setFilters(prev => ({
            ...prev,
            sortField: field,
            sortOrder: prev.sortField === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
            page: 1,
        }));
    };
    
    const handleSelect = (id) => {
        setSelected(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const handleSelectAll = (isChecked) => {
        if (isChecked) setSelected(new Set(data?.assets.map(a => a._id) || []));
        else setSelected(new Set());
    };

    const isAllSelected = useMemo(() => {
        return data?.assets.length > 0 && selected.size === data.assets.length;
    }, [selected, data]);
    
    const handleDeleteConfirm = () => {
        deleteMutation.mutate({ orphanedAssetIds: Array.from(selected) }, {
            onSuccess: (data) => {
                toast.success(data.message);
                setSelected(new Set());
            },
            onError: (error) => {
                toast.error(error.message || t('common:error.generic'));
            },
            onSettled: () => {
                setDeleteModalOpen(false);
            }
        });
    };

    const formatBytes = (bytes, decimals = 2) => {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('platform.assetCleanupTitle', 'Asset Reconciliation Console')}</CardTitle>
                <CardDescription>{t('platform.assetCleanupDesc', 'Review assets identified as potentially orphaned. Select and delete assets to reclaim storage.')}</CardDescription>
                <div className="flex flex-col md:flex-row gap-2 pt-4">
                    <Select onValueChange={(value) => setFilters(prev => ({...prev, resourceType: value === 'all' ? '' : value, page: 1}))}>
                         <SelectTrigger className="w-full md:w-[180px]">
                            <SelectValue placeholder={t('platform.filterResourceType', 'Filter by Type')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('platform.allTypes', 'All Resource Types')}</SelectItem>
                            <SelectItem value="image">{t('platform.image', 'Image')}</SelectItem>
                            <SelectItem value="video">{t('platform.video', 'Video')}</SelectItem>
                            <SelectItem value="raw">{t('platform.raw', 'Raw')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select onValueChange={(value) => setFilters(prev => ({...prev, assetType: value === 'all' ? '' : value, page: 1}))}>
                         <SelectTrigger className="w-full md:w-[220px]">
                            <SelectValue placeholder={t('platform.filterAssetType', 'Filter by Asset Type')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('platform.allAssetTypes', 'All Asset Types')}</SelectItem>
                            {ASSET_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={String(filters.limit)} onValueChange={(value) => setFilters(prev => ({...prev, limit: Number(value), page: 1}))}>
                         <SelectTrigger className="w-full md:w-[180px]">
                            <SelectValue placeholder={t('platform.itemsPerPage', 'Items per page')} />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="15">15 {t('platform.perPage', 'per page')}</SelectItem>
                           <SelectItem value="50">50 {t('platform.perPage', 'per page')}</SelectItem>
                           <SelectItem value="100">100 {t('platform.perPage', 'per page')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="flex-grow" />
                    <Button variant="delete-outline" onClick={() => setDeleteModalOpen(true)} disabled={selected.size === 0 || deleteMutation.isLoading}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('platform.deleteSelected', 'Delete ({{count}})', { count: selected.size })}
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border hidden md:block">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]"><Checkbox checked={isAllSelected} onCheckedChange={handleSelectAll} /></TableHead>
                                <SortableHeader field="publicId" currentSort={filters} onSort={handleSort}>{t('platform.table.publicId', 'Public ID')}</SortableHeader>
                                <SortableHeader field="assetType" currentSort={filters} onSort={handleSort}>{t('platform.table.assetType', 'Asset Type')}</SortableHeader>
                                <SortableHeader field="folder" currentSort={filters} onSort={handleSort}>{t('platform.table.folder', 'Folder')}</SortableHeader>
                                <SortableHeader field="fileSize" currentSort={filters} onSort={handleSort}>{t('platform.table.size', 'Size')}</SortableHeader>
                                <SortableHeader field="format" currentSort={filters} onSort={handleSort}>{t('platform.table.format', 'Format')}</SortableHeader>
                                <SortableHeader field="createdAtCloudinary" currentSort={filters} onSort={handleSort}>{t('platform.table.created', 'Created')}</SortableHeader>
                                <SortableHeader field="discoveredAt" currentSort={filters} onSort={handleSort}>{t('platform.table.discovered', 'Discovered')}</SortableHeader>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: filters.limit }).map((_, i) => ( <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-12 w-full" /></TableCell></TableRow> ))
                            ) : isError ? (
                                <TableRow><TableCell colSpan={8} className="text-center text-red-500">{t('common:error.generic')}</TableCell></TableRow>
                            ) : data?.assets.length > 0 ? (
                                data.assets.map(asset => (
                                    <TableRow key={asset._id} data-state={selected.has(asset._id) ? "selected" : ""}>
                                        <TableCell><Checkbox checked={selected.has(asset._id)} onCheckedChange={() => handleSelect(asset._id)} /></TableCell>
                                        <TableCell className="font-mono text-xs max-w-[200px] truncate">{asset.publicId}</TableCell>
                                        <TableCell><Badge variant="secondary">{asset.assetType}</Badge></TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{asset.folder || 'N/A'}</TableCell>
                                        <TableCell>{formatBytes(asset.fileSize)}</TableCell>
                                        <TableCell><Badge variant="outline">{asset.format}</Badge></TableCell>
                                        <TableCell>{new Date(asset.createdAtCloudinary).toLocaleDateString()}</TableCell>
                                        <TableCell>{new Date(asset.discoveredAt).toLocaleDateString()}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={8} className="text-center h-24">{t('platform.noOrphans', 'No pending orphaned assets found.')}</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                <div className="md:hidden space-y-2">
                 {isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)
                    ) : isError ? (
                       <p className="text-center text-red-500">{t('common:error.generic')}</p>
                    ) : data?.assets.length > 0 ? (
                        data.assets.map(asset => (
                            <Card key={asset._id} className={`bg-background ${selected.has(asset._id) ? "border-primary" : ""}`}>
                                <CardContent className="p-4 flex gap-4">
                                    <div className="mt-1"><Checkbox checked={selected.has(asset._id)} onCheckedChange={() => handleSelect(asset._id)} /></div>
                                    <div className="flex-grow space-y-2 overflow-hidden">
                                         <p className="font-mono text-xs break-all">{asset.publicId}</p>
                                         <div className="flex flex-wrap gap-2">
                                            <Badge variant="secondary">{asset.assetType}</Badge>
                                            <Badge variant="outline">{asset.format}</Badge>
                                         </div>
                                         <p className="text-sm text-muted-foreground"><strong>{t('platform.table.size')}:</strong> {formatBytes(asset.fileSize)}</p>
                                         <p className="text-sm text-muted-foreground"><strong>{t('platform.table.folder')}:</strong> {asset.folder || 'N/A'}</p>
                                    </div>
                                </CardContent>
                                <CardFooter className="p-4 pt-0 text-xs text-muted-foreground flex justify-between">
                                    <span><strong>{t('platform.table.created')}:</strong> {new Date(asset.createdAtCloudinary).toLocaleDateString()}</span>
                                    <span><strong>{t('platform.table.discovered')}:</strong> {new Date(asset.discoveredAt).toLocaleDateString()}</span>
                                </CardFooter>
                            </Card>
                        ))
                    ) : (
                       <p className="text-center py-10">{t('platform.noOrphans', 'No pending orphaned assets found.')}</p>
                    )}
                </div>

                {data?.totalPages > 1 && (
                    <div className="mt-4">
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem><PaginationPrevious onClick={() => setFilters(prev => ({...prev, page: Math.max(1, prev.page - 1)}))} disabled={filters.page === 1 || isLoading} /></PaginationItem>
                                <PaginationItem><span className="px-4 py-2 text-sm">{t('common:pageNumber', { current: data.currentPage, total: data.totalPages })}</span></PaginationItem>
                                <PaginationItem><PaginationNext onClick={() => setFilters(prev => ({...prev, page: Math.min(data.totalPages, prev.page + 1)}))} disabled={filters.page === data.totalPages || isLoading} /></PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </div>
                )}
            </CardContent>

            <AlertDialog open={isDeleteModalOpen} onOpenChange={setDeleteModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('platform.confirmDeletionTitle', 'Confirm Permanent Deletion')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('platform.confirmDeletionDesc', 'You are about to permanently delete {{count}} assets. This action is irreversible. Are you sure?', { count: selected.size })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isLoading}>{t('common:cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={deleteMutation.isLoading}
                            className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white"
                        >
                            {deleteMutation.isLoading ? t('common:deleting') : t('common:delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
};

export default AdminAssetCleanupTab;