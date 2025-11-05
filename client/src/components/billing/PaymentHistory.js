import React from 'react';
import { useQuery, useMutation } from 'react-query';
import { fetchInvoices, getInvoiceDownloadUrl } from '../../services/invoiceAPI';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { Button } from '../ui/button.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';
import { Download, FileText, AlertCircle, PercentCircle } from 'lucide-react';

const getInvoiceDescription = (invoice) => {
    if (invoice.payment?.program?.title) return `Program: ${invoice.payment.program.title}`;
    // Use the booking title from the nested populated field
    if (invoice.payment?.booking?.title) return `Session: ${invoice.payment.booking.title}`;
    return 'Coaching Platform Service';
};

const PaymentHistorySkeleton = () => (
    <div className="space-y-2">
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
    </div>
);

export const PaymentHistory = () => {
    const { t } = useTranslation('settings');
    const { data: invoices, isLoading, isError } = useQuery('invoices', fetchInvoices);

    const downloadMutation = useMutation(getInvoiceDownloadUrl, {
        onSuccess: (url) => {
            window.open(url, '_blank', 'noopener,noreferrer');
        },
        onError: (error) => {
            console.error("Failed to get download link:", error);
            alert(t('billing.downloadError', 'Could not retrieve download link. Please try again.'));
        }
    });

    const renderContent = () => {
        if (isLoading) {
            return <PaymentHistorySkeleton />;
        }

        if (isError) {
            return (
                <div className="flex flex-col items-center justify-center text-center py-10">
                    <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                    <p className="text-lg font-semibold text-destructive">{t('billing.errorTitle', 'Failed to load invoices')}</p>
                    <p className="text-muted-foreground">{t('billing.errorDescription', 'There was a problem fetching your payment history. Please try again later.')}</p>
                </div>
            );
        }

        if (!invoices || invoices.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center text-center py-10">
                    <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-semibold">{t('billing.noInvoicesTitle', 'No Invoices Yet')}</p>
                    <p className="text-muted-foreground">{t('billing.noInvoicesDescription', 'Your payment history will appear here once you make your first purchase.')}</p>
                </div>
            );
        }

        return (
            <div className="w-full overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[120px]">{t('billing.date', 'Date')}</TableHead>
                            <TableHead className="w-[150px]">{t('billing.invoiceNumber', 'Invoice #')}</TableHead>
                            <TableHead>{t('billing.description', 'Description')}</TableHead>
                            <TableHead className="text-right">{t('billing.amount', 'Amount')}</TableHead>
                            <TableHead className="w-[50px] text-right">{t('billing.actions', 'Actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {invoices.map((invoice) => {
                            const discount = invoice.payment?.discountApplied;
                            const priceSnapshot = invoice.payment?.priceSnapshot;
                            const hasDiscount = discount && discount.amountDeducted > 0;
                            const baseAmount = priceSnapshot?.base?.amount?.amount;

                            return (
                                <TableRow key={invoice._id}>
                                    <TableCell className="font-medium">{new Date(invoice.createdAt).toLocaleDateString()}</TableCell>
                                    <TableCell className="text-muted-foreground">{invoice.invoiceNumber}</TableCell>
                                    <TableCell>{getInvoiceDescription(invoice)}</TableCell>
                                    <TableCell className="text-right font-mono">
                                        {hasDiscount && typeof baseAmount === 'number' ? (
                                            <div className="flex flex-col items-end">
                                                <span>{`${invoice.amountPaid.toFixed(2)} ${invoice.currency}`}</span>
                                                <TooltipProvider delayDuration={100}>
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span className="text-xs text-muted-foreground line-through flex items-center gap-1 cursor-help">
                                                          <PercentCircle className="h-3 w-3 text-green-500" />
                                                          {baseAmount.toFixed(2)}
                                                        </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                      <p>{t('billing.discountApplied', 'Discount Applied')}: {discount.code} (-{discount.amountDeducted.toFixed(2)} {invoice.currency})</p>
                                                    </TooltipContent>
                                                  </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                        ) : (
                                            <span>{`${invoice.amountPaid.toFixed(2)} ${invoice.currency}`}</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <TooltipProvider delayDuration={100}>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        onClick={() => downloadMutation.mutate(invoice._id)}
                                                        disabled={downloadMutation.isLoading && downloadMutation.variables === invoice._id}
                                                        aria-label={t('billing.downloadInvoice', 'Download Invoice')}
                                                    >
                                                        <Download className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{t('billing.downloadInvoice', 'Download Invoice')}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        );
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('billing.historyTitle', 'Payment History')}</CardTitle>
                <CardDescription>
                    {t('billing.historyDescription', 'Here is a list of all your past payments and invoices.')}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {renderContent()}
            </CardContent>
        </Card>
    );
};