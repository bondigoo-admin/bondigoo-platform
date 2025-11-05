import React, { useState, useMemo } from 'react';
import { useAdminQueues, useAdminQueueJobs, useAdminJobDetails, useAdminPerformJobAction, useAdminPerformQueueAction } from '../../../hooks/useAdmin';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table.tsx';
import { Button } from '../../ui/button.tsx';
import { ChevronLeft, ChevronRight, Eye, AlertCircle, CheckCircle, Clock, Play, Trash2, Pause, PlayCircle, Loader2, ArrowUpCircle } from 'lucide-react';
import { Badge } from '../../ui/badge.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../ui/dialog.tsx';
import { ScrollArea } from '../../ui/scroll-area.jsx';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../ui/accordion.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.tsx';
import { Checkbox } from '../../ui/checkbox.tsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../ui/alert-dialog.tsx';
import { Progress } from '../../ui/progress.jsx';
import { useQueryClient } from 'react-query';
import { useNotificationSocket } from '../../../contexts/SocketContext';

// JobDetailsDialog component remains unchanged.
const JobDetailsDialog = ({ queueName, jobId }) => {
    const { t } = useTranslation(['admin', 'common']);
    const { data: job, isLoading } = useAdminJobDetails(queueName, jobId);

    if (isLoading || !job) {
        return <div className="p-6"><Skeleton className="h-4 w-full mb-2" /><Skeleton className="h-4 w-3/4" /></div>;
    }

    return (
        <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle>{t('system.jobs.details.title', 'Job Details')}: {job.id}</DialogTitle></DialogHeader>
            {job.progress > 0 && (
                <div className="my-2">
                    <div className="flex justify-between items-center mb-1">
                        <h4 className="font-semibold text-sm">{t('system.jobs.details.progress', 'Progress')}</h4>
                        <span className="text-sm text-muted-foreground">{job.progress}%</span>
                    </div>
                    <Progress value={job.progress} className="w-full" />
                </div>
            )}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div><h4 className="font-semibold">{t('system.jobs.details.name', 'Job Name')}</h4><p className="text-sm text-muted-foreground">{job.name}</p></div>
                <div><h4 className="font-semibold">{t('system.jobs.details.attempts', 'Attempts Made')}</h4><p className="text-sm text-muted-foreground">{job.attemptsMade} / {job.opts.attempts}</p></div>
                <div><h4 className="font-semibold">{t('system.jobs.details.added', 'Added To Queue')}</h4><p className="text-sm text-muted-foreground">{new Date(job.timestamp).toLocaleString()}</p></div>
                <div><h4 className="font-semibold">{t('system.jobs.details.processed', 'Last Processed')}</h4><p className="text-sm text-muted-foreground">{job.processedOn ? new Date(job.processedOn).toLocaleString() : 'N/A'}</p></div>
            </div>
            <Tabs defaultValue="data" className="mt-4">
                <TabsList>
                    <TabsTrigger value="data">{t('system.jobs.details.data', 'Data')}</TabsTrigger>
                    <TabsTrigger value="history">{t('system.jobs.details.history', 'Attempt History')}</TabsTrigger>
                </TabsList>
                <TabsContent value="data">
                    <ScrollArea className="h-64 mt-2 p-4 bg-muted rounded-md border">
                        <pre className="text-sm whitespace-pre-wrap break-all">{JSON.stringify(job.data, null, 2)}</pre>
                    </ScrollArea>
                </TabsContent>
                <TabsContent value="history">
                     <ScrollArea className="h-64 mt-2">
                        {job.stacktrace && job.stacktrace.length > 0 ? (
                             <Accordion type="single" collapsible className="w-full">
                                {job.stacktrace.map((trace, index) => (
                                    <AccordionItem value={`item-${index}`} key={index}>
                                        <AccordionTrigger>{t('system.jobs.details.attempt', 'Attempt #{{index}}', {index: index + 1})}</AccordionTrigger>
                                        <AccordionContent>
                                            <pre className="text-xs whitespace-pre-wrap break-all p-2 bg-muted rounded-md">{job.failedReason?.split('\n')[0]}</pre>
                                            <pre className="text-xs whitespace-pre-wrap break-all p-2 mt-2 bg-muted rounded-md">{trace}</pre>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        ) : (
                            <p className="text-sm text-muted-foreground p-4">{t('system.jobs.details.noHistory', 'No failure history available.')}</p>
                        )}
                    </ScrollArea>
                </TabsContent>
            </Tabs>
        </DialogContent>
    );
};


const JobQueueManager = () => {
    const { t } = useTranslation(['admin', 'common']);
    const [selectedQueue, setSelectedQueue] = useState('');
    const [filters, setFilters] = useState({ page: 1, limit: 15, status: 'failed' });
    const [selection, setSelection] = useState({});
    const [dialogAction, setDialogAction] = useState(null); // 'retry', 'delete', 'pause', 'resume'

    const { data: queuesData, isLoading: queuesLoading } = useAdminQueues();
    const { data: jobsData, isLoading: jobsLoading } = useAdminQueueJobs(selectedQueue, filters);
    const jobActionMutation = useAdminPerformJobAction();
    const queueActionMutation = useAdminPerformQueueAction();
    const { socket, isConnected } = useNotificationSocket();
    const queryClient = useQueryClient();
    
    const selectedJobIds = useMemo(() => Object.keys(selection).filter(key => selection[key]), [selection]);

    const handleMutation = (mutation, payload) => {
        mutation.mutate(payload, {
            onSuccess: () => {
                setSelection({});
                setDialogAction(null);
            },
            onError: (err) => {
                console.error(err);
                setDialogAction(null);
            },
        });
    };
    
    const handleConfirm = () => {
        if (!dialogAction) return;
        const reason = `Admin action: ${dialogAction}`;
        if (['retry', 'delete', 'promote'].includes(dialogAction)) {
            handleMutation(jobActionMutation, { queueName: selectedQueue, jobIds: selectedJobIds, action: dialogAction, reason, jobStatus: filters.status });
        } else if (['pause', 'resume'].includes(dialogAction)) {
            handleMutation(queueActionMutation, { queueName: selectedQueue, action: dialogAction, reason });
        }
    };
    
    // Reset selection when filters or queue changes
    React.useEffect(() => { setSelection({}) }, [filters, selectedQueue]);

    React.useEffect(() => {
        if (!socket) return;

        const handleQueueUpdate = () => {
            queryClient.invalidateQueries(['adminQueues']);
        };

        socket.on('job_queue_update', handleQueueUpdate);

        return () => {
            socket.off('job_queue_update', handleQueueUpdate);
        };
    }, [socket, queryClient]);
    
    const handleQueueChange = (queueName) => {
        setSelectedQueue(queueName);
        setFilters(prev => ({ ...prev, page: 1 }));
    };

    const handlePageChange = (newPage) => setFilters(prev => ({ ...prev, page: newPage }));
    const handleStatusChange = (newStatus) => setFilters(prev => ({...prev, status: newStatus, page: 1}));
    const getStatusIcon = (job) => {
        if (job.failedReason) return <AlertCircle className="h-4 w-4 text-destructive" />;
        if (job.finishedOn) return <CheckCircle className="h-4 w-4 text-green-500" />;
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    };

    const jobs = jobsData?.jobs || [];
    const totalPages = jobsData?.totalPages || 1;

    const isActionLoading = jobActionMutation.isLoading || queueActionMutation.isLoading;

    return (
        <AlertDialog open={!!dialogAction} onOpenChange={(open) => !open && setDialogAction(null)}>
           <div className="flex flex-col h-full bg-card md:rounded-lg md:border">
      <div className="p-4 border-b space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <Select onValueChange={handleQueueChange} value={selectedQueue} disabled={queuesLoading}>
                            <SelectTrigger><SelectValue placeholder={t('system.jobs.selectQueue', 'Select a queue...')} /></SelectTrigger>
                            <SelectContent>
                                {queuesData?.map(q => (
                                    <SelectItem key={q.name} value={q.name}>
                                        <div className="flex justify-between w-full">
                                            <span>{q.name}</span>
                                            <span className="text-xs space-x-2 text-muted-foreground">
                                                <span>W: {q.waiting}</span>
                                                <span>A: {q.active}</span>
                                                <span>D: {q.delayed}</span>
                                                <span className={q.failed > 0 ? 'text-destructive font-bold' : ''}>F: {q.failed}</span>
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select onValueChange={handleStatusChange} value={filters.status} disabled={!selectedQueue}>
                            <SelectTrigger><SelectValue placeholder={t('system.jobs.filterStatus', 'Filter by status...')} /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="failed">{t('system.jobs.status.failed', 'Failed')}</SelectItem>
                                <SelectItem value="active">{t('system.jobs.status.active', 'Active')}</SelectItem>
                                <SelectItem value="waiting">{t('system.jobs.status.waiting', 'Waiting')}</SelectItem>
                                <SelectItem value="delayed">{t('system.jobs.status.delayed', 'Delayed')}</SelectItem>
                                <SelectItem value="completed">{t('system.jobs.status.completed', 'Completed')}</SelectItem>
                            </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                             <Button onClick={() => setDialogAction('pause')} disabled={!selectedQueue || isActionLoading} variant="outline"><Pause className="h-4 w-4 mr-2" />{t('system.jobs.actions.pauseQueue')}</Button>
                             <Button onClick={() => setDialogAction('resume')} disabled={!selectedQueue || isActionLoading} variant="outline"><PlayCircle className="h-4 w-4 mr-2" />{t('system.jobs.actions.resumeQueue')}</Button>
                        </div>
                    </div>
                     {selectedJobIds.length > 0 && (
                        <div className="flex items-center gap-4 bg-muted p-2 rounded-lg">
                           <p className="text-sm font-medium flex-grow">{t('system.jobs.selectedCount', '{{count}} selected', {count: selectedJobIds.length})}</p>
                           <Button onClick={() => setDialogAction('retry')} size="sm" disabled={isActionLoading}><Play className="h-4 w-4 mr-2" />{t('system.jobs.actions.retry')}</Button>
                           {filters.status === 'delayed' && <Button onClick={() => setDialogAction('promote')} size="sm" variant="outline" disabled={isActionLoading}><ArrowUpCircle className="h-4 w-4 mr-2" />{t('system.jobs.actions.promote')}</Button>}
                           <Button onClick={() => setDialogAction('delete')} size="sm" variant="destructive" disabled={isActionLoading}><Trash2 className="h-4 w-4 mr-2" />{t('system.jobs.actions.delete')}</Button>
                        </div>
                    )}
                </div>
                <div className="overflow-auto flex-grow">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[40px]"><Checkbox checked={selectedJobIds.length === jobs.length && jobs.length > 0} onCheckedChange={(checked) => setSelection(checked ? jobs.reduce((obj, job) => ({...obj, [job.id]: true}), {}) : {})} /></TableHead>
                                <TableHead className="w-[40px]"></TableHead>
                                <TableHead>{t('system.jobs.table.name', 'Name')}</TableHead>
                                <TableHead>{t('system.jobs.table.id', 'Job ID')}</TableHead>
                                <TableHead className="hidden md:table-cell">{t('system.jobs.table.created', 'Created')}</TableHead>
                                <TableHead className="text-right">{t('common:actions', 'Actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(jobsLoading) ? Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)
                            : !selectedQueue ? <TableRow><TableCell colSpan={6} className="h-24 text-center">{t('system.jobs.selectQueuePrompt')}</TableCell></TableRow>
                            : jobs.length === 0 ? <TableRow><TableCell colSpan={6} className="h-24 text-center">{t('system.jobs.noJobs', 'No jobs found for this status.')}</TableCell></TableRow>
                            : jobs.map(job => (
                                <TableRow key={job.id}>
                                    <TableCell><Checkbox checked={!!selection[job.id]} onCheckedChange={(checked) => setSelection(prev => ({...prev, [job.id]: checked}))} /></TableCell>
                                    <TableCell>{getStatusIcon(job)}</TableCell>
                                    <TableCell className="font-medium">{job.name}</TableCell>
                                    <TableCell className="font-mono text-xs">{job.id}</TableCell>
                                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{formatDistanceToNow(new Date(job.timestamp), { addSuffix: true })}</TableCell>
                                    <TableCell className="text-right">
                                        <Dialog>
                                            <DialogTrigger asChild><Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button></DialogTrigger>
                                            <JobDetailsDialog queueName={selectedQueue} jobId={job.id} />
                                        </Dialog>
                                    </TableCell>
                                </TableRow>
                            ))
                            }
                        </TableBody>
                    </Table>
                </div>
                <div className="flex items-center justify-between p-4 border-t">
                    <div className="text-sm text-muted-foreground">{t('common:paginationText', 'Page {{currentPage}} of {{totalPages}}', { currentPage: jobsData?.currentPage || 1, totalPages })}</div>
                    <div className="space-x-2"><Button variant="outline" size="sm" onClick={() => handlePageChange(filters.page - 1)} disabled={filters.page === 1 || jobsLoading}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="sm" onClick={() => handlePageChange(filters.page + 1)} disabled={filters.page === totalPages || jobsLoading}><ChevronRight className="h-4 w-4" /></Button></div>
                </div>
            </div>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('system.jobs.confirm.title', 'Are you sure?')}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {dialogAction === 'retry' && t('system.jobs.confirm.retryDesc', 'This will re-queue the selected jobs for processing.')}
                        {dialogAction === 'delete' && t('system.jobs.confirm.deleteDesc', 'This will permanently delete the selected jobs. This action cannot be undone.')}
                        {dialogAction === 'pause' && t('system.jobs.confirm.pauseDesc', 'This will pause the entire queue, preventing new jobs from being processed.')}
                        {dialogAction === 'resume' && t('system.jobs.confirm.resumeDesc', 'This will resume processing for the selected queue.')}
                        {dialogAction === 'promote' && t('system.jobs.confirm.promoteDesc', 'This will move the selected delayed jobs to the waiting state for immediate processing.')}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t('common:cancel', 'Cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirm} disabled={isActionLoading}>
                        {isActionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('common:continue', 'Continue')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

export default JobQueueManager;