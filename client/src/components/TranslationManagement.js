import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, FileDown, Loader2, Search } from 'lucide-react';
import * as adminAPI from '../services/adminAPI';

// ShadCN/UI Component Imports (as per your guidelines with file extensions)
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table.tsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card.tsx';
import { Alert, AlertDescription, AlertTitle } from './ui/alert.tsx';
import { Progress } from './ui/progress.jsx';
import { Skeleton } from './ui/skeleton.jsx';

const TranslationManagement = () => {
  const { t } = useTranslation(['admin']);
  const [translations, setTranslations] = useState({});
  const [languages] = useState(['en', 'fr', 'de', 'es']);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [overview, setOverview] = useState({});
  const [sortField, setSortField] = useState('original');
  const [sortDirection, setSortDirection] = useState('asc');
  const [filterText, setFilterText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  const [selectedListType, setSelectedListType] = useState(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(true);
  const [isTranslationsLoading, setIsTranslationsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchTranslationOverview();
  }, []);

  useEffect(() => {
    if (selectedListType) {
      fetchTranslations(selectedListType);
    } else {
      setTranslations({});
    }
  }, [selectedListType]);

  const fetchTranslations = async (listType) => {
    setIsTranslationsLoading(true);
    setError(null);
    try {
      const allTranslations = {};
      for (const lang of languages) {
        const response = await adminAPI.getTranslations(listType, lang);
        allTranslations[lang] = response.translations;
      }
      setTranslations(allTranslations);
    } catch (err) {
      setError(t('admin:errorFetchingTranslations'));
    } finally {
      setIsTranslationsLoading(false);
    }
  };

  const fetchTranslationOverview = async () => {
    setIsOverviewLoading(true);
    try {
      const response = await adminAPI.getTranslationOverview();
      setOverview(response);
    } catch (err) {
      setError(t('admin:errorFetchingOverview'));
    } finally {
      setIsOverviewLoading(false);
    }
  };

  const calculateListProgress = useCallback((list) => {
    if (!list) return 0;
    let totalPercentage = 0;
    let count = 0;
    Object.entries(list).forEach(([lang, status]) => {
      if (lang !== 'en') {
        totalPercentage += status.percentage;
        count++;
      }
    });
    return count > 0 ? totalPercentage / count : 0;
  }, []);

  const overallProgress = useMemo(() => {
    if (!overview || Object.keys(overview).length === 0) return 0;
    const total = Object.values(overview).reduce((acc, list) => acc + calculateListProgress(list), 0);
    const count = Object.keys(overview).length;
    return count > 0 ? total / count : 0;
  }, [overview, calculateListProgress]);

  const getProgressColorClass = (percentage) => {
    if (percentage < 1) return 'bg-red-500';
    if (percentage < 50) return 'bg-orange-500';
    if (percentage < 80) return 'bg-yellow-400';
    return 'bg-green-500';
  };

  const handleTranslationChange = (key, lang, value) => {
    setTranslations(prev => ({
      ...prev,
      [lang]: { 
        ...prev[lang], 
        [key]: { 
          ...prev[lang]?.[key],
          translation: value.trim() !== '' ? value : undefined 
        }
      }
    }));
  };

  const handleListTypeSelect = (listType) => {
    if (selectedListType === listType) {
      setSelectedListType(null); // Deselect if clicked again
    } else {
      setSelectedListType(listType);
      setCurrentPage(1);
      setFilterText('');
    }
  };

  const saveTranslations = async () => {
    setIsSaving(true);
    setError(null);
    try {
      for (const lang of languages) {
        if (lang === 'en' || !translations[lang]) continue;
        for (const [key, data] of Object.entries(translations[lang])) {
          if (data.translation && data.translation.trim() !== '') {
            await adminAPI.updateTranslation(selectedListType, key, lang, data.translation);
          }
        }
      }
      setSuccessMessage(t('admin:translationsSaved'));
      setTimeout(() => setSuccessMessage(''), 3000);
      fetchTranslationOverview();
    } catch (err) {
      setError(t('admin:errorSavingTranslations') + ': ' + (err.response?.data?.message || err.message));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSort = (field) => {
    setSortDirection(prevDirection => (field === sortField ? (prevDirection === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortField(field);
  };

  const filteredAndSortedTranslations = useMemo(() => {
    if (!translations.en) return [];
    let result = Object.entries(translations.en);
    if (filterText) {
      result = result.filter(([, data]) => 
        data.original.toLowerCase().includes(filterText.toLowerCase())
      );
    }
    result.sort((a, b) => {
      const aValue = a[1].original.toLowerCase();
      const bValue = b[1].original.toLowerCase();
      return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    });
    return result;
  }, [translations.en, filterText, sortDirection]);

  const paginatedTranslations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedTranslations.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedTranslations, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedTranslations.length / itemsPerPage);

  if (error) {
    return (
      <div className="p-4 md:p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('admin:errorOccurred')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{t('admin:translationManagement')}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{t('admin:translationManagementDescription')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin:translationOverview')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isOverviewLoading ? (
            <Skeleton className="h-4 w-full rounded-full" />
          ) : (
            <div className="flex items-center gap-4">
              <Progress value={overallProgress} className={getProgressColorClass(overallProgress)} />
              <span className="font-semibold text-slate-700 dark:text-slate-300 min-w-[50px] text-right">{overallProgress.toFixed(1)}%</span>
            </div>
          )}
        </CardContent>
      </Card>
      
      {successMessage && (
        <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle className="text-green-800 dark:text-green-300">{t('admin:success')}</AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-400">
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">{t('admin:listTypesTitle')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {isOverviewLoading ? (
            Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
          ) : (
            Object.entries(overview).map(([listType, languagesData]) => {
              const progress = calculateListProgress(languagesData);
              return (
                <Card 
                  key={listType} 
                  onClick={() => handleListTypeSelect(listType)}
                  className={`cursor-pointer transition-all hover:shadow-md dark:hover:bg-slate-800/60 ${selectedListType === listType ? 'ring-2 ring-primary dark:ring-primary' : 'ring-1 ring-transparent'}`}
                >
                  <CardHeader>
                    <CardTitle className="text-lg">{t(`admin:listTypes.${listType}`)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <Progress value={progress} className={getProgressColorClass(progress)} />
                      <span className="font-medium text-sm text-slate-600 dark:text-slate-400">{progress.toFixed(0)}%</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
      
      {selectedListType && (
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle>{t('admin:editingListType', { listType: t(`admin:listTypes.${selectedListType}`) })}</CardTitle>
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <div className="relative w-full sm:w-auto">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <Input
                      type="text"
                      placeholder={t('admin:filterTranslations')}
                      value={filterText}
                      onChange={(e) => { setFilterText(e.target.value); setCurrentPage(1); }}
                      className="pl-8 w-full sm:w-64"
                  />
                </div>
                <Button onClick={() => alert('Export functionality not implemented.')} variant="outline" disabled>
                  <FileDown className="mr-2 h-4 w-4" /> {t('admin:exportTranslations')}
                </Button>
                <Button onClick={saveTranslations} disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSaving ? t('admin:saving') : t('admin:saveTranslations')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isTranslationsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead onClick={() => handleSort('original')} className="cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          {t('admin:originalTerm')} {sortField === 'original' && (sortDirection === 'asc' ? '▲' : '▼')}
                        </TableHead>
                        {languages.filter(l => l !== 'en').map(lang => (
                          <TableHead key={lang}>{t(`admin:language.${lang}`)}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedTranslations.map(([key, data]) => (
                        <TableRow key={key}>
                          <TableCell className="font-medium">{data.original}</TableCell>
                          {languages.filter(l => l !== 'en').map(lang => (
                            <TableCell key={lang}>
                              <Input
                                value={translations[lang]?.[key]?.translation || ''}
                                onChange={(e) => handleTranslationChange(key, lang, e.target.value)}
                                placeholder={t('admin:enterTranslation')}
                                className={!translations[lang]?.[key]?.translation ? 'bg-red-100 dark:bg-red-900/20 focus-visible:ring-red-500' : ''}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                  {paginatedTranslations.map(([key, data]) => (
                    <div key={key} className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg">
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200 pb-2 mb-2 border-b border-slate-200 dark:border-slate-700">{data.original}</h4>
                      <div className="space-y-3">
                        {languages.filter(l => l !== 'en').map(lang => (
                          <div key={lang}>
                            <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                              {t(`admin:language.${lang}`)}
                            </label>
                            <Input
                              value={translations[lang]?.[key]?.translation || ''}
                              onChange={(e) => handleTranslationChange(key, lang, e.target.value)}
                              placeholder={t('admin:enterTranslation')}
                              className={!translations[lang]?.[key]?.translation ? 'bg-red-100 dark:bg-red-900/20 focus-visible:ring-red-500' : ''}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
          {totalPages > 1 && (
            <CardFooter>
              <div className="flex items-center justify-center w-full space-x-2">
                <Button variant="outline" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>{t('admin:previousPage')}</Button>
                <span className="text-sm text-slate-600 dark:text-slate-400">{t('admin:pageXofY', { current: currentPage, total: totalPages })}</span>
                <Button variant="outline" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}>{t('admin:nextPage')}</Button>
              </div>
            </CardFooter>
          )}
        </Card>
      )}
      
      {!selectedListType && !isOverviewLoading && (
        <Card className="text-center py-12">
            <CardContent>
                <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">{t('admin:selectListPromptTitle')}</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-2">{t('admin:selectListPromptDescription')}</p>
            </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TranslationManagement;