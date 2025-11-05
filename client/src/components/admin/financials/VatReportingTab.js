import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { subDays, format } from 'date-fns';
import { useAdminVatReport, useAdminB2bDocumentUrl, useAdminVatThresholds } from '../../../hooks/useAdmin';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table.tsx';
import { Button } from '../../ui/button.tsx';
import { Badge } from '../../ui/badge.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { Download, Loader2, Calendar as CalendarIcon, FileUp, ArrowRight, ArrowLeft, Copy, ArrowUpDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover.jsx';
import { Progress } from '../../ui/progress.jsx';
import { Calendar } from '../../ui/calendar.jsx';
import { Input } from '../../ui/input.tsx';
import { useDebounce } from 'use-debounce';
import { cn } from '../../../lib/utils';

const StatCard = ({ title, value, isLoading }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent>
            {isLoading ? (
                <Skeleton className="h-8 w-3/4" />
            ) : (
                <div className="text-2xl font-bold">{value}</div>
            )}
        </CardContent>
    </Card>
);

const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) {
        return new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(0);
    }
    return new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(value);
};


const VatReportingTab = () => {
    const { t } = useTranslation(['admin', 'common']);
    const [date, setDate] = useState({
        from: subDays(new Date(), 29),
        to: new Date(),
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebounce(searchTerm, 500);
    const [sort, setSort] = useState({ field: 'createdAt', order: 'desc' });

    const filters = {
        startDate: date?.from ? format(date.from, 'yyyy-MM-dd') : undefined,
        endDate: date?.to ? format(date.to, 'yyyy-MM-dd') : undefined,
        search: debouncedSearchTerm || undefined,
        sortField: sort.field,
        sortOrder: sort.order,
    };

    const { data, isLoading, isError } = useAdminVatReport(filters);
    const { data: thresholdData, isLoading: isLoadingThresholds } = useAdminVatThresholds();
    const downloadMutation = useAdminB2bDocumentUrl();
    
    useEffect(() => {
        if (data) {
            console.log('[VatReportingTab Debug] Data received from useAdminVatReport hook:', data);
        }
    }, [data]);

    const handleSort = (field) => {
        setSort(prev => ({
            field,
            order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
        }));
    };

    const handleDownload = (invoiceId) => {
        downloadMutation.mutate(invoiceId, {
            onSuccess: (response) => {
                if (response.data.pdfUrl) {
                    window.open(response.data.pdfUrl, '_blank');
                } else {
                    toast.error(t('financials.pdfNotAvailable'));
                }
            },
            onError: (error) => {
                toast.error(error.response?.data?.message || t('common:error.generic'));
            }
        });
    };
    
    const handleExportCsv = () => {
        if (!data || !data.documents || data.documents.length === 0) {
            toast.error(t('financials.noDataToExport', 'No data to export.'));
            return;
        }

        const headers = [
            'Date', 'Payment ID', 'Transaction Party', 'Document Type', 'Net Amount', 'VAT Amount', 'Total Amount', 'PDF URL'
        ];
        const rows = data.documents.map(doc => [
            format(new Date(doc.date), 'yyyy-MM-dd'),
            doc.paymentId || '',
            `"${doc.partyName.replace(/"/g, '""')}"`,
            doc.documentType,
            doc.netAmount,
            doc.vatAmount,
            doc.totalAmount,
            doc.pdfUrl
        ]);

        const csvContent = "data:text/csv;charset=utf-8," 
            + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `tax_report_${filters.startDate}_to_${filters.endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(t('financials.exportStarted', 'CSV export started.'));
    };
    
    const getDocumentTypeVariant = (doc) => {
      if (doc.type === 'Credit Note') return 'destructive';
      if (doc.documentParty === 'coach_to_platform') return 'secondary';
      if (doc.documentParty === 'platform_to_client') return 'outline';
      return 'outline';
    };

    const getDocumentTypeText = (doc) => {
        let key;
        if (doc.documentParty === 'coach_to_platform') {
            key = doc.type === 'Invoice' ? 'b2bInvoice' : 'b2bCreditNote';
        } else {
            key = doc.type === 'Invoice' ? 'b2cInvoice' : 'b2cCreditNote';
        }
        const fallbackText = `${doc.documentParty === 'coach_to_platform' ? 'B2B' : 'B2C'} ${doc.documentType}`;
        return t(`financials.docTypes.${key}`, fallbackText);
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                <h3 className="text-lg font-medium">{t('financials.vatReportTitle', 'VAT & Tax Reporting')}</h3>
                <div className="flex w-full flex-col sm:w-auto sm:flex-row items-center gap-2">
                     <Input
                        placeholder={t('financials.searchByPaymentId', 'Filter by Payment ID...')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-9 w-full sm:w-[250px]"
                    />
                    <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            id="date"
                            variant={"outline"}
                            className={cn(
                              "w-full sm:w-[240px] justify-start text-left font-normal",
                              !date && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date?.from ? (
                              date.to ? (
                                <>
                                  {format(date.from, "LLL dd, y")} -{" "}
                                  {format(date.to, "LLL dd, y")}
                                </>
                              ) : (
                                format(date.from, "LLL dd, y")
                              )
                            ) : (
                              <span>{t('financials.pickDate', 'Pick a date')}</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={date?.from}
                            selected={date}
                            onSelect={setDate}
                            numberOfMonths={2}
                          />
                        </PopoverContent>
                    </Popover>
                    <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={isLoading || !data?.documents || data.documents.length === 0}>
                        <FileUp className="mr-2 h-4 w-4" />
                        {t('common:exportCsv', 'Export CSV')}
                    </Button>
                </div>
            </div>

                    <Card>
            <CardHeader>
                <CardTitle className="text-base font-semibold">{t('financials.euThresholdTitle', 'EU VAT Registration Threshold')}</CardTitle>
                <p className="text-sm text-muted-foreground">
                    {t('financials.euThresholdDescription', 'Tracking B2C sales to all EU countries against the €10,000 annual threshold.')}
                </p>
            </CardHeader>
            <CardContent>
                {isLoadingThresholds ? (
                    <Skeleton className="h-20 w-full" />
                ) : thresholdData ? (
                    <div className="space-y-2">
                        <Progress value={thresholdData.percentage} className="w-full" />
                        <div className="flex justify-between items-baseline pt-1">
                            <div className="text-xl font-bold text-primary">
                                {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(thresholdData.totalEuSalesEUR)}
                            </div>
                            <div className="text-sm font-medium text-muted-foreground">
                                {t('financials.ofThreshold', 'of {{threshold}} ({{percent}}%)', {
                                    threshold: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(thresholdData.thresholdEUR),
                                    percent: thresholdData.percentage.toFixed(1)
                                })}
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="text-destructive">{t('common:error.generic')}</p>
                )}
            </CardContent>
        </Card>

            <div className="grid gap-4 md:grid-cols-3">
                <StatCard title={t('financials.kpi.totalOutputVat', 'Total Output VAT (Umsatzsteuer)')} value={formatCurrency(data?.summary?.totalOutputVat)} isLoading={isLoading} />
                <StatCard title={t('financials.kpi.totalInputVat', 'Total Input VAT (Vorsteuer)')} value={formatCurrency(data?.summary?.totalInputVat)} isLoading={isLoading} />
                <StatCard title={t('financials.kpi.netTaxOwed', 'Net Tax Owed')} value={formatCurrency(data?.summary?.netTaxOwed)} isLoading={isLoading} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t('financials.allTransactionsTitle', 'All Tax-Relevant Transactions')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="w-full overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead onClick={() => handleSort('createdAt')} className="cursor-pointer whitespace-nowrap">{t('financials.columns.date', 'Date')} <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead>
                                    <TableHead onClick={() => handleSort('partyName')} className="cursor-pointer whitespace-nowrap">{t('financials.columns.party', 'Party')} <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead>
                                    <TableHead onClick={() => handleSort('payment')} className="cursor-pointer whitespace-nowrap">{t('financials.columns.paymentId', 'Payment ID')} <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead>
                                    <TableHead onClick={() => handleSort('type')} className="cursor-pointer whitespace-nowrap">{t('financials.columns.documentType', 'Document Type')} <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead>
                                    <TableHead onClick={() => handleSort('netAmount')} className="text-right cursor-pointer whitespace-nowrap">{t('financials.columns.netAmount', 'Net Amount')} <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead>
                                    <TableHead onClick={() => handleSort('vatAmount')} className="text-right cursor-pointer whitespace-nowrap">{t('financials.columns.vatAmount', 'VAT Amount')} <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead>
                                    <TableHead onClick={() => handleSort('amountPaid')} className="text-right cursor-pointer whitespace-nowrap">{t('financials.columns.totalAmount', 'Total Amount')} <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead>
                                    <TableHead className="text-right">{t('financials.columns.document', 'Document')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : isError ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center text-destructive">{t('common:error.generic')}</TableCell>
                                    </TableRow>
                                ) : data?.documents?.length > 0 ? (
                                    data.documents.map((doc) => (
                                        <TableRow key={doc._id}>
                                            <TableCell>{format(new Date(doc.date), 'PP')}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    {doc.documentParty === 'coach_to_platform' ? 
                                                      <ArrowRight className="h-4 w-4 text-orange-500" title={t('financials.expenseHint', 'Expense for Platform')} /> : 
                                                      <ArrowLeft className="h-4 w-4 text-green-500" title={t('financials.revenueHint', 'Revenue for Platform')} />}
                                                    <span className="font-medium">{doc.partyName}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {doc.paymentId && (
                                                    <Button
                                                        variant="ghost"
                                                        className="p-0 h-auto font-mono text-xs flex items-center gap-1"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(doc.paymentId);
                                                            toast.success(t('common:copiedToClipboard', 'Copied to clipboard'));
                                                            setSearchTerm(doc.paymentId);
                                                        }}
                                                        title={t('financials.filterByPaymentId', 'Filter by this Payment ID')}
                                                    >
                                                        ...{doc.paymentId.slice(-6)}
                                                        <Copy className="h-3 w-3" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={getDocumentTypeVariant(doc)}>
                                                    {getDocumentTypeText(doc)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(doc.netAmount)}</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(doc.vatAmount)}</TableCell>
                                            <TableCell className="text-right font-mono font-medium">{formatCurrency(doc.totalAmount)}</TableCell>
                                            <TableCell className="text-right">
                                                {doc.pdfUrl ? (
                                                    <Button variant="ghost" size="icon" onClick={() => handleDownload(doc._id)} disabled={downloadMutation.isLoading && downloadMutation.variables === doc._id}>
                                                        {downloadMutation.isLoading && downloadMutation.variables === doc._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                                    </Button>
                                                ) : null}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-24 text-center">{t('financials.noDataForPeriod', 'No data available for the selected period.')}</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default VatReportingTab;