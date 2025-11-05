import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useAdminDiscounts, useCreateDiscount, useUpdateDiscount, useDeleteDiscount } from '../../../hooks/useAdmin';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../ui/table.tsx';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '../../ui/pagination.jsx';
import { Button } from '../../ui/button.tsx';
import { Badge } from '../../ui/badge.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { PlusCircle, MoreHorizontal, ArrowUp, ArrowDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '../../ui/dropdown-menu.tsx';
import CreateEditDiscountModal from './CreateEditDiscountModal';
import { toast } from 'react-hot-toast';
import { logger } from '../../../utils/logger';

const DiscountManagement = () => {
  const { t } = useTranslation(['admin', 'common']);
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
  
  const { data, isLoading } = useAdminDiscounts({ 
    page, 
    limit: 10, 
    sortField: sortConfig.key,
    sortOrder: sortConfig.direction,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDiscount, setSelectedDiscount] = useState(null);

  const createMutation = useCreateDiscount();
  const updateMutation = useUpdateDiscount();
  const deleteMutation = useDeleteDiscount();

  const handleSort = (key) => {
    setSortConfig(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  const SortableHeader = ({ children, sortKey, className = '' }) => {
    const isSorted = sortConfig.key === sortKey;
    const Icon = sortConfig.direction === 'asc' ? ArrowUp : ArrowDown;
    return (
        <TableHead onClick={() => handleSort(sortKey)} className={`cursor-pointer hover:bg-muted/50 ${className}`}>
            <div className="flex items-center gap-2">
                {children}
                {isSorted && <Icon className="h-4 w-4" />}
            </div>
        </TableHead>
    );
  };

  const handleSave = (discountData) => {
    const promise = discountData._id
      ? updateMutation.mutateAsync({ discountId: discountData._id, updates: discountData })
      : createMutation.mutateAsync(discountData);

    toast.promise(promise, {
      loading: t('common:saving'),
      success: t(discountData._id ? 'financials.discountUpdated' : 'financials.discountCreated'),
      error: (err) => err.response?.data?.message || t('common:error.generic'),
    });
    
    return promise;
  };

  const handleDelete = (discountId) => {
     if (window.confirm(t('common:confirmDelete'))) {
        const promise = deleteMutation.mutateAsync(discountId);
        toast.promise(promise, {
          loading: t('common:deleting'),
          success: t('financials.discountDeleted'),
          error: (err) => err.response?.data?.message || t('common:error.generic'),
        });
     }
  };

  const handleOpenModal = (discount = null) => {
    logger.info('[DiscountManagement] Opening modal', { discountId: discount?._id });
    setSelectedDiscount(discount);
    setIsModalOpen(true);
  };
  
  const formatCurrency = (value, currency) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: currency || 'CHF' }).format(value || 0);

  const getStatus = (discount) => {
    if (!discount.isActive) return { text: 'Inactive', variant: 'secondary' };
    if (discount.expiryDate && new Date(discount.expiryDate) < new Date()) return { text: 'Expired', variant: 'outline' };
    return { text: 'Active', variant: 'success' };
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">{t('financials.discountManagementTitle', 'Discount Management')}</h2>
        <Button onClick={() => handleOpenModal()}>
          <PlusCircle className="mr-2 h-4 w-4" />
          {t('financials.createDiscount')}
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader sortKey="code">{t('financials.columns.code')}</SortableHeader>
              <SortableHeader sortKey="coach.firstName">{t('financials.columns.coach')}</SortableHeader>
              <SortableHeader sortKey="value">{t('financials.columns.value')}</SortableHeader>
              <SortableHeader sortKey="appliesTo.scope" className="hidden lg:table-cell">{t('financials.columns.scope')}</SortableHeader>
              <SortableHeader sortKey="timesUsed" className="hidden sm:table-cell">{t('financials.columns.usage')}</SortableHeader>
              <SortableHeader sortKey="expiryDate" className="hidden lg:table-cell">{t('financials.columns.validUntil', 'Valid Until')}</SortableHeader>
              <SortableHeader sortKey="isActive">{t('financials.columns.status')}</SortableHeader>
              <TableHead className="text-right">{t('financials.columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                    <TableCell colSpan={8}><Skeleton className="h-5 w-full" /></TableCell>
                </TableRow>
              ))
            ) : data?.discounts?.length > 0 ? (
              data.discounts.map(d => {
                const status = getStatus(d);
                return (
                  <TableRow key={d._id}>
                    <TableCell>
                        <p className="font-mono font-medium">{d.code}</p>
                        {d.isAutomatic && <Badge variant="outline" className="mt-1">Automatic</Badge>}
                    </TableCell>
                    <TableCell>{d.coach ? `${d.coach.firstName} ${d.coach.lastName}` : 'N/A'}</TableCell>
                    <TableCell>{d.type === 'percent' ? `${d.value}%` : formatCurrency(d.value, 'CHF')}</TableCell>
                    <TableCell className="hidden lg:table-cell capitalize">{d.appliesTo?.scope.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="hidden sm:table-cell">{d.timesUsed} / {d.usageLimit || '∞'}</TableCell>
                    <TableCell className="hidden lg:table-cell">{d.expiryDate ? format(new Date(d.expiryDate), 'PP') : t('common:unlimited')}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>
                        {t(`financials.statuses.${status.text.toLowerCase()}`, status.text)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenModal(d)}>{t('common:edit')}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSave({ ...d, isActive: !d.isActive })}>{d.isActive ? t('common:deactivate') : t('common:activate')}</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDelete(d._id)} className="text-destructive focus:text-destructive">{t('common:delete')}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow><TableCell colSpan={8} className="h-24 text-center">{t('financials.noDiscounts')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {data?.totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem><PaginationPrevious onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || isLoading} /></PaginationItem>
            <PaginationItem><span className="px-4 py-2 text-sm">{t('common:pageNumber', { current: data.currentPage, total: data.totalPages })}</span></PaginationItem>
            <PaginationItem><PaginationNext onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages || isLoading} /></PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
      <CreateEditDiscountModal 
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        discount={selectedDiscount}
        onSave={handleSave}
      />
    </div>
  );
};

export default DiscountManagement;