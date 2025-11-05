import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useAdminPayouts, useAdminUpdatePayoutStatus } from '../../../hooks/useAdmin';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../ui/table.tsx';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '../../ui/pagination.jsx';
import { Button } from '../../ui/button.tsx';
import { Badge } from '../../ui/badge.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { ExternalLink, MoreHorizontal, PauseCircle, PlayCircle, RefreshCw, ArrowUpDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../ui/dropdown-menu.tsx';
import { toast } from 'react-hot-toast';
import { Separator } from '../../ui/separator.jsx';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../../ui/tooltip.tsx';
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
import { Input } from '../../ui/input.tsx';
import { Label } from '../../ui/label.tsx';

const PayoutManagement = () => {
  const { t } = useTranslation(['admin', 'common']);
  const [filters, setFilters] = useState({ page: 1, limit: 10, sortField: 'createdAt', sortOrder: 'desc' });
  const [holdModalState, setHoldModalState] = useState({ isOpen: false, paymentId: null, reason: '' });
  const { data, isLoading } = useAdminPayouts(filters);
  const updateStatusMutation = useAdminUpdatePayoutStatus();

  const handleUpdateStatus = (paymentId, action) => {
    if (action === 'hold') {
      setHoldModalState({ isOpen: true, paymentId, reason: '' });
      return;
    }

    updateStatusMutation.mutate({ paymentId, action, reason: t('financials_actionByAdmin') }, {
        onSuccess: (data) => toast.success(data.message),
        onError: (err) => toast.error(err.response?.data?.message || t('common:error.generic'))
    });
  };
  
  const handleConfirmHold = () => {
    if (!holdModalState.reason) {
      toast.error(t('financials_holdReasonRequired'));
      return;
    }
    updateStatusMutation.mutate(
      { paymentId: holdModalState.paymentId, action: 'hold', reason: holdModalState.reason },
      {
        onSuccess: (data) => {
          toast.success(data.message);
          setHoldModalState({ isOpen: false, paymentId: null, reason: '' });
        },
        onError: (err) => toast.error(err.response?.data?.message || t('common:error.generic'))
      }
    );
  };

  const handleSort = (field) => {
    setFilters(prev => ({
      ...prev,
      page: 1,
      sortField: field,
      sortOrder: prev.sortField === field && prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }));
  };
  
  const submittedBadgeClasses = 'border-transparent bg-green-100 text-green-800 hover:bg-green-100/80 dark:bg-green-900/50 dark:text-green-300';
  const getStatusVariant = (status) => ({
      paid_out: 'success',
      submitted: 'outline',
      processing: 'default',
      pending: 'secondary',
      failed: 'destructive',
      on_hold: 'warning'
  }[status] || 'outline');

  const formatCurrency = (value, currency) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: currency || 'CHF' }).format(value || 0);

const columns = useMemo(() => [
    { header: t('financials.columns.details'), id: 'details', sortable: true, field: 'createdAt' },
    { header: t('financials.columns.payoutStatus'), id: 'payoutStatus', sortable: true, field: 'payoutStatus' },
    { header: t('financials.columns.gross'), id: 'gross', sortable: true, field: 'grossAmount' },
    { header: t('financials.columns.refunded'), id: 'refunded', sortable: true, field: 'refundedAmount' },
    { header: t('financials.columns.stripeFee'), id: 'stripeFee', sortable: false },
    { header: t('financials.columns.vat'), id: 'vat', sortable: false },
    { header: t('financials.columns.platformFee'), id: 'platformFee', sortable: true, field: 'platformFee' },
    { header: t('financials.columns.coachVat', 'Vorsteuer'), id: 'coachVat', sortable: false },
    { header: t('financials.columns.netPayout'), id: 'net', sortable: true, field: 'netPayout' },
    { header: t('financials.columns.actions'), id: 'actions', sortable: false },
  ], [t]);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader className="hidden md:table-header-group">
              <TableRow>
                <TableHead onClick={() => handleSort('createdAt')} className="cursor-pointer whitespace-nowrap">{t('financials.columns.details')} <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead>
                <TableHead onClick={() => handleSort('payoutStatus')} className="cursor-pointer whitespace-nowrap">{t('financials.columns.payoutStatus')} <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead>
                <TableHead onClick={() => handleSort('grossAmount')} className="text-right cursor-pointer whitespace-nowrap">{t('financials.columns.gross')} <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead>
                <TableHead onClick={() => handleSort('refundedAmount')} className="text-right cursor-pointer whitespace-nowrap hidden lg:table-cell">{t('financials.columns.refunded')} <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead>
                <TableHead className="text-right hidden xl:table-cell">{t('financials.columns.stripeFee')}</TableHead>
                <TableHead className="text-right hidden xl:table-cell">{t('financials.columns.vat')}</TableHead>
                <TableHead onClick={() => handleSort('platformFee')} className="text-right hidden lg:table-cell cursor-pointer whitespace-nowrap">{t('financials.columns.platformFee')} <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead>
                <TableHead className="text-right hidden xl:table-cell">{t('financials.columns.coachVat', 'Vorsteuer')}</TableHead>
                <TableHead onClick={() => handleSort('netPayout')} className="text-right cursor-pointer whitespace-nowrap">{t('financials.columns.netPayout')} <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead>
                <TableHead className="text-right">{t('financials.columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                      <TableCell colSpan={columns.length} className="p-4 md:hidden">
                          <div className="flex justify-between items-start gap-4">
                              <div className="space-y-1.5"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-40" /></div>
                              <div className="flex flex-col items-end space-y-1.5"><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-16" /></div>
                          </div>
                      </TableCell>
                      {columns.map(col => <TableCell key={col.id} className="hidden md:table-cell"><Skeleton className="h-5 w-full" /></TableCell>)}
                  </TableRow>
                ))
              ) : data?.payouts?.length > 0 ? (
                data.payouts.map((payout) => (
                  <TableRow key={payout._id} className="border-b">
                    <TableCell colSpan={columns.length} className="p-4 md:hidden">
                        <div className="flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                               <div className="flex-1 overflow-hidden">
                                    <p className="font-medium truncate">{payout.coach ? `${payout.coach.firstName} ${payout.coach.lastName}` : 'N/A'}</p>
                                    <p className="text-sm text-muted-foreground">{format(new Date(payout.createdAt), 'PP p')}</p>
                                </div>
                              <Tooltip>
                                  <TooltipTrigger>
                                    <Badge 
                                      variant={getStatusVariant(payout.payoutStatus)} 
                                      className={`ml-2 shrink-0 ${payout.payoutStatus === 'submitted' ? submittedBadgeClasses : ''}`}
                                    >
                                      {t(`financials_payoutStatus_${payout.payoutStatus}`, payout.payoutStatus)}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                      <p>{t(`financials_payoutStatusTooltip_${payout.payoutStatus}`)}</p>
                                  </TooltipContent>
                                </Tooltip>
                            </div>
                             <p className="font-mono text-xs text-muted-foreground truncate">{payout.stripeTransferId || t('financials.noTransferId')}</p>
                            <div className="rounded-md border bg-muted/50 p-3 text-sm">
                                 <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                  <span>{t('financials.columns.gross')}</span><span className="text-right font-medium">{formatCurrency(payout.grossAmount, payout.currency)}</span>
                                  {payout.refundedAmount > 0 && <><span>(-) {t('financials.columns.refunded', 'Refunded')}</span><span className="text-right text-destructive">{formatCurrency(payout.refundedAmount, payout.currency)}</span></>}
                                  <span className="text-muted-foreground">(-) {t('financials.columns.stripeFee')}</span><span className="text-right text-muted-foreground">{formatCurrency(payout.processingFee, payout.currency)}</span>
                                  <span className="text-muted-foreground">(-) {t('financials.columns.vat')}</span><span className="text-right text-muted-foreground">{formatCurrency(payout.vatAmount, payout.currency)}</span>
                                  <span className="text-muted-foreground">(-) {t('financials.columns.platformFee')}</span><span className="text-right text-muted-foreground">{formatCurrency(payout.platformFee, payout.currency)}</span>
                                  {payout.coachB2bVat > 0 && <><span>(+) {t('financials.columns.coachVat', 'Vorsteuer')}</span><span className="text-right text-muted-foreground">{formatCurrency(payout.coachB2bVat, payout.currency)}</span></>}
                              </div>
                              <Separator className="my-2" />
                              <div className="grid grid-cols-2 gap-x-4">
                                  <span className="font-semibold">{t('financials.columns.netPayout')}</span><span className="text-right font-semibold">{formatCurrency(payout.netPayout, payout.currency)}</span>
                              </div>
                            </div>
                            <div className="flex justify-end items-center gap-2">
                               <DropdownMenu>
                                  <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                      {payout.stripeTransferId && <DropdownMenuItem asChild><a href={`https://dashboard.stripe.com/connect/transfers/${payout.stripeTransferId}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />{t('financials.viewInStripe')}</a></DropdownMenuItem>}
                                      {payout.payoutStatus === 'pending' && <DropdownMenuItem onClick={() => handleUpdateStatus(payout._id, 'hold')}><PauseCircle className="mr-2 h-4 w-4" />{t('financials_action_hold')}</DropdownMenuItem>}
                                      {payout.payoutStatus === 'on_hold' && <DropdownMenuItem onClick={() => handleUpdateStatus(payout._id, 'release')}><PlayCircle className="mr-2 h-4 w-4" />{t('financials_action_release')}</DropdownMenuItem>}
                                      {payout.payoutStatus === 'failed' && <DropdownMenuItem onClick={() => handleUpdateStatus(payout._id, 'retry')}><RefreshCw className="mr-2 h-4 w-4" />{t('financials_action_retry')}</DropdownMenuItem>}
                                  </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                        </div>
                    </TableCell>
                   <TableCell className="hidden md:table-cell">
                      <div className="font-medium truncate">{payout.coach ? `${payout.coach.firstName} ${payout.coach.lastName}` : 'N/A'}</div>
                      <div className="text-xs text-muted-foreground">{format(new Date(payout.createdAt), 'PP')}</div>
                       <div className="font-mono text-xs text-muted-foreground truncate">{payout.stripeTransferId || t('financials.noTransferId')}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge 
                            variant={getStatusVariant(payout.payoutStatus)}
                            className={payout.payoutStatus === 'submitted' ? submittedBadgeClasses : ''}
                          >
                            {t(`financials_payoutStatus_${payout.payoutStatus}`, payout.payoutStatus)}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{t(`financials_payoutStatusTooltip_${payout.payoutStatus}`)}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                   <TableCell className="hidden md:table-cell text-right font-medium">{formatCurrency(payout.grossAmount, payout.currency)}</TableCell>
                    <TableCell className="hidden lg:table-cell text-right text-destructive">{payout.refundedAmount > 0 ? `-${formatCurrency(payout.refundedAmount, payout.currency)}` : null}</TableCell>
                    <TableCell className="hidden xl:table-cell text-right text-muted-foreground">{formatCurrency(payout.processingFee, payout.currency)}</TableCell>
                    <TableCell className="hidden xl:table-cell text-right text-muted-foreground">{formatCurrency(payout.vatAmount, payout.currency)}</TableCell>
                    <TableCell className="hidden lg:table-cell text-right text-muted-foreground">{formatCurrency(payout.platformFee, payout.currency)}</TableCell>
                    <TableCell className="hidden xl:table-cell text-right text-muted-foreground">{payout.coachB2bVat > 0 ? `+${formatCurrency(payout.coachB2bVat, payout.currency)}` : null}</TableCell>
                    <TableCell className="hidden md:table-cell text-right font-semibold">{formatCurrency(payout.netPayout, payout.currency)}</TableCell>
                    <TableCell className="hidden md:table-cell text-right">
                      <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                              {payout.stripeTransferId && <DropdownMenuItem asChild><a href={`https://dashboard.stripe.com/connect/transfers/${payout.stripeTransferId}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />{t('financials.viewInStripe')}</a></DropdownMenuItem>}
                              {payout.payoutStatus === 'pending' && <DropdownMenuItem onClick={() => handleUpdateStatus(payout._id, 'hold')}><PauseCircle className="mr-2 h-4 w-4" />{t('financials_action_hold')}</DropdownMenuItem>}
                              {payout.payoutStatus === 'on_hold' && <DropdownMenuItem onClick={() => handleUpdateStatus(payout._id, 'release')}><PlayCircle className="mr-2 h-4 w-4" />{t('financials_action_release')}</DropdownMenuItem>}
                              {payout.payoutStatus === 'failed' && <DropdownMenuItem onClick={() => handleUpdateStatus(payout._id, 'retry')}><RefreshCw className="mr-2 h-4 w-4" />{t('financials_action_retry')}</DropdownMenuItem>}
                          </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {t('financials.noPayouts')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {data?.totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem><PaginationPrevious onClick={() => setFilters(p => ({ ...p, page: Math.max(1, p.page - 1) }))} disabled={filters.page === 1 || isLoading} /></PaginationItem>
              <PaginationItem><span className="px-4 py-2 text-sm">{t('common:pageNumber', { current: data.currentPage, total: data.totalPages })}</span></PaginationItem>
              <PaginationItem><PaginationNext onClick={() => setFilters(p => ({ ...p, page: Math.min(data.totalPages, p.page + 1) }))} disabled={filters.page === data.totalPages || isLoading} /></PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
      <AlertDialog open={holdModalState.isOpen} onOpenChange={(isOpen) => setHoldModalState(prev => ({ ...prev, isOpen }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('financials_holdPayoutTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('financials_holdReasonPrompt')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="hold-reason">{t('financials_reasonLabel')}</Label>
            <Input
              id="hold-reason"
              value={holdModalState.reason}
              onChange={(e) => setHoldModalState(prev => ({ ...prev, reason: e.target.value }))}
              placeholder={t('financials_reasonPlaceholder')}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setHoldModalState({ isOpen: false, paymentId: null, reason: '' })}>
              {t('common:cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmHold} disabled={updateStatusMutation.isLoading || !holdModalState.reason}>
              {t('financials_confirmHold')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};

export default PayoutManagement;