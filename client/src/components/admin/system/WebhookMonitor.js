import React, { useState, useEffect, useMemo } from 'react';
import { useAdminWebhookLogs, useReplayWebhook, useBulkReplayWebhooks } from '../../../hooks/useAdmin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table.tsx';
import { Button } from '../../ui/button.tsx';
import { ChevronLeft, ChevronRight, Eye, PlayCircle, Loader2, MoreHorizontal, AlertTriangle, Info } from 'lucide-react';
import { Badge } from '../../ui/badge.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Input } from '../../ui/input.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog.tsx';
import { ScrollArea } from '../../ui/scroll-area.jsx';
import { useToast } from '../../../hooks/useToast.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../ui/dropdown-menu.tsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../ui/alert-dialog.tsx';
import { Checkbox } from '../../ui/checkbox.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip.tsx';

const WebhookMonitor = () => {
  const { t } = useTranslation(['admin', 'common']);
  const { toast } = useToast();
  const [filters, setFilters] = useState({
    page: 1,
    limit: 15,
    status: '',
    eventType: '',
    search: '',
    sortField: 'createdAt',
    sortOrder: 'desc',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeTerm, setEventTypeTerm] = useState('');
  const [rowSelection, setRowSelection] = useState({});
  const [singleReplayLogId, setSingleReplayLogId] = useState(null);
  const [viewingLog, setViewingLog] = useState(null); // State to control payload view dialog
  const [isBulkReplayDialogOpen, setIsBulkReplayDialogOpen] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchTerm, page: 1 }));
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setFilters(prev => ({ ...prev, eventType: eventTypeTerm, page: 1 }));
    }, 500);
    return () => clearTimeout(handler);
  }, [eventTypeTerm]);

  useEffect(() => {
    setRowSelection({});
  }, [filters.page]);

  const { data, isLoading, isError, error } = useAdminWebhookLogs(filters);
  const replayMutation = useReplayWebhook();
  const bulkReplayMutation = useBulkReplayWebhooks();

  const selectedLogIds = useMemo(() => Object.keys(rowSelection).filter(key => rowSelection[key]), [rowSelection]);
  const failedSelectedCount = useMemo(() => {
      return selectedLogIds.reduce((count, id) => {
          const log = data?.logs?.find(l => l._id === id);
          return log && log.status === 'failed' ? count + 1 : count;
      }, 0);
  }, [selectedLogIds, data?.logs]);

  const handleReplay = (logId) => {
    if (!logId) return;
    replayMutation.mutate({ logId, reason: 'Manual replay from Admin Panel' }, {
      onSuccess: () => toast({ title: t('system.webhooks.replaySuccess'), description: t('system.webhooks.replaySuccessDesc') }),
      onError: (err) => {
        const errorMessage = err.response?.data?.message || err.message;
        toast({ title: t('system.webhooks.replayError'), description: errorMessage, variant: 'destructive' });
      },
      onSettled: () => setSingleReplayLogId(null)
    });
  };

  const handleBulkReplay = () => {
    const idsToReplay = selectedLogIds.filter(id => {
        const log = data?.logs?.find(l => l._id === id);
        return log && log.status === 'failed';
    });
    bulkReplayMutation.mutate({ logIds: idsToReplay, reason: 'Bulk replay from Admin Panel' }, {
      onSuccess: (response) => toast({ title: t('system.webhooks.bulkReplayComplete'), description: response.message }),
      onError: (err) => {
        const errorMessage = err.response?.data?.message || err.message;
        toast({ title: t('system.webhooks.replayError'), description: errorMessage, variant: 'destructive' });
      },
      onSettled: () => {
        setIsBulkReplayDialogOpen(false);
        setRowSelection({});
      }
    });
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const logs = data?.logs || [];
  const totalPages = data?.totalPages || 1;

  const getStatusVariant = (status) => (status === 'processed' ? 'success' : 'destructive');

  return (
    <div className="flex h-full flex-col bg-card md:rounded-lg md:border">
      <div className="p-4 border-b space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Input
            placeholder={t('system.webhooks.searchPlaceholder', 'Search payload (e.g., pi_..)...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value === 'all' ? '' : value)}>
            <SelectTrigger><SelectValue placeholder={t('system.webhooks.filterStatus', 'Filter by status...')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common:all', 'All Statuses')}</SelectItem>
              <SelectItem value="processed">{t('system.webhooks.status.processed', 'Processed')}</SelectItem>
              <SelectItem value="failed">{t('system.webhooks.status.failed', 'Failed')}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder={t('system.webhooks.filterEventType', 'Filter by event type...')}
            value={eventTypeTerm}
            onChange={(e) => setEventTypeTerm(e.target.value)}
          />
        </div>
        {selectedLogIds.length > 0 && (
            <div className="flex items-center justify-between p-2 bg-muted rounded-md">
                <span className="text-sm font-medium">{t('system.webhooks.selectedCount', { count: selectedLogIds.length })}</span>
                 <AlertDialog open={isBulkReplayDialogOpen} onOpenChange={setIsBulkReplayDialogOpen}>
                    <AlertDialogTrigger asChild>
                        <Button size="sm" disabled={failedSelectedCount === 0 || bulkReplayMutation.isLoading}>
                            {bulkReplayMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                            {t('system.webhooks.replaySelected', { count: failedSelectedCount })}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{t('system.webhooks.replayConfirmTitle', 'Are you sure?')}</AlertDialogTitle>
                            <AlertDialogDescription>{t('system.webhooks.bulkReplayConfirmDesc', { count: failedSelectedCount })}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t('common:cancel', 'Cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={handleBulkReplay}>{t('common:continue', 'Continue')}</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        )}
      </div>
      <div className="overflow-auto flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={selectedLogIds.length === logs.length && logs.length > 0}
                  onCheckedChange={(value) => {
                    const newSelection = {};
                    if (value) {
                      logs.forEach(log => newSelection[log._id] = true);
                    }
                    setRowSelection(newSelection);
                  }}
                />
              </TableHead>
              <TableHead>{t('system.webhooks.table.status', 'Status')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('system.webhooks.table.source', 'Source')}</TableHead>
              <TableHead>{t('system.webhooks.table.eventType', 'Event Type')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('system.webhooks.table.error', 'Error')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('system.webhooks.table.timestamp', 'Timestamp')}</TableHead>
              <TableHead className="text-right">{t('common:actions', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: filters.limit }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {t('system.webhooks.noLogs', 'No webhook logs found.')}
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log._id} data-state={rowSelection[log._id] && "selected"}>
                  <TableCell>
                    <Checkbox
                        checked={!!rowSelection[log._id]}
                        onCheckedChange={(value) => {
                            setRowSelection(prev => ({...prev, [log._id]: !!value}));
                        }}
                    />
                  </TableCell>
                  <TableCell><Badge variant={getStatusVariant(log.status)} className="capitalize">{log.status}</Badge></TableCell>
                  <TableCell className="hidden sm:table-cell"><Badge variant="outline" className="capitalize">{log.source}</Badge></TableCell>
                  <TableCell className="font-mono text-xs break-all">{log.eventType}</TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-destructive truncate max-w-xs">
                    {log.errorMessage && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>{log.errorMessage}</TooltipTrigger>
                                <TooltipContent><p className="max-w-md">{log.errorMessage}</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{format(new Date(log.createdAt), 'PPpp')}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setViewingLog(log)}>
                              <Eye className="mr-2 h-4 w-4" />{t('system.webhooks.actions.view', 'View Payload')}
                          </DropdownMenuItem>
                        {log.status === 'failed' && (
                          <DropdownMenuItem onSelect={() => setSingleReplayLogId(log._id)}>
                              <PlayCircle className="mr-2 h-4 w-4" />
                              {t('system.webhooks.actions.replay', 'Replay Webhook')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between p-4 border-t">
        <div className="text-sm text-muted-foreground">
          {t('common:paginationText', 'Page {{currentPage}} of {{totalPages}}', { currentPage: data?.currentPage || 1, totalPages })}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleFilterChange('page', Math.max(filters.page - 1, 1))}
            disabled={filters.page === 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleFilterChange('page', Math.min(filters.page + 1, totalPages))}
            disabled={filters.page === totalPages || isLoading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Dialogs are now outside the table, controlled by state */}
      <Dialog open={!!viewingLog} onOpenChange={(open) => !open && setViewingLog(null)}>
        <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{t('system.webhooks.payloadTitle', 'Webhook Payload')}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[60vh] mt-4 p-4 bg-muted rounded-md border">
                <pre className="text-sm whitespace-pre-wrap break-all">
                    {viewingLog && JSON.stringify(JSON.parse(viewingLog.payload), null, 2)}
                </pre>
            </ScrollArea>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!singleReplayLogId} onOpenChange={(open) => !open && setSingleReplayLogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
              <AlertDialogTitle>{t('system.webhooks.replayConfirmTitle', 'Are you sure?')}</AlertDialogTitle>
              <AlertDialogDescription>{t('system.webhooks.replayConfirmDesc', 'This will re-process the webhook event. This can lead to duplicate data or actions if the original event was partially processed. Continue?')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
              <AlertDialogCancel>{t('common:cancel', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleReplay(singleReplayLogId)} disabled={replayMutation.isLoading}>
                   {replayMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('common:continue', 'Continue')}
              </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WebhookMonitor;