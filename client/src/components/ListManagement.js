import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { 
  List, Plus, Edit, Trash2, Save, X, ChevronLeft, ChevronRight, 
  Search, ArrowUpDown, Trash, Download, Upload, RotateCcw, RotateCw,
  HelpCircle, Users2, MoreVertical
} from 'lucide-react';
import * as adminAPI from '../services/adminAPI';
import { toast } from 'react-hot-toast';
import debounce from 'lodash/debounce';
import { format } from 'date-fns';
import { FixedSizeList as VirtualList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { useHotkeys } from 'react-hotkeys-hook';

import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Textarea } from './ui/textarea.tsx';
import { Checkbox } from './ui/checkbox.tsx';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog.tsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu.tsx';

const ITEMS_PER_PAGE = 100;

const ListManagement = () => {
  const { t, i18n } = useTranslation(['common', 'admin']);
  const [selectedListType, setSelectedListType] = useState(null);
  const [newItemName, setNewItemName] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedItems, setSelectedItems] = useState([]);
  const [actionHistory, setActionHistory] = useState([]);
  const [actionIndex, setActionIndex] = useState(-1);
  const [isQuickAddMode, setIsQuickAddMode] = useState(false);
  const [quickAddItems, setQuickAddItems] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, message: '', onConfirm: null });
  const [detailedItem, setDetailedItem] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemName, setEditingItemName] = useState('');
  const [additionalFields, setAdditionalFields] = useState({});

  const queryClient = useQueryClient();
  
  const { data: listTypes } = useQuery('listTypes', adminAPI.getListTypes);

  const { data: listItems, isLoading: isLoadingItems, refetch: refetchItems } = useQuery(
    ['listItems', selectedListType, currentPage, searchTerm, sortField, sortOrder],
    () => adminAPI.getListItems(selectedListType, currentPage, ITEMS_PER_PAGE, searchTerm, sortField, sortOrder),
    { 
      enabled: !!selectedListType,
      onSuccess: () => setSelectedItems([]),
      onError: (error) => {
        console.error('Error fetching list items:', error);
        toast.error(t('admin:errorFetchingItems'));
      }
    }
  );

  useEffect(() => {
    if (selectedListType) {
      refetchItems();
      setSelectedItems([]);
      setActionHistory([]);
      setActionIndex(-1);
    }
  }, [selectedListType, currentPage, searchTerm, sortField, sortOrder]);

  useEffect(() => {
    setIsQuickAddMode(false);
    setEditingItemId(null);
  }, [selectedListType]);

  const addToHistory = (action, newData, oldData = null) => {
    const newHistory = actionHistory.slice(0, actionIndex + 1);
    newHistory.push({ action, newData, oldData });
    setActionHistory(newHistory);
    setActionIndex(newHistory.length - 1);
  };

  const addMutation = useMutation(
    (newItem) => {
      let itemToAdd = { name: newItem.name, ...additionalFields };
      // Logic for specific list types can be added here
      return adminAPI.addListItem(selectedListType, itemToAdd);
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries(['listItems', selectedListType]);
        toast.success(t('admin:itemAdded'));
        addToHistory('add', data);
        setNewItemName('');
        setAdditionalFields({});
      },
      onError: (error) => {
        console.error('Error adding item:', error);
        toast.error(t('admin:errorAddingItem'));
      }
    }
  );

  const updateMutation = useMutation(
    (updatedItem) => adminAPI.updateListItem(selectedListType, updatedItem),
    {
      onMutate: async (updatedItem) => {
        await queryClient.cancelQueries(['listItems', selectedListType]);
        const previousData = queryClient.getQueryData(['listItems', selectedListType]);
        const oldItem = previousData?.items.find(item => item._id === updatedItem._id);
        addToHistory('update', updatedItem, oldItem);
        return { previousData };
      },
      onSuccess: () => {
        toast.success(t('admin:itemUpdated'));
        setEditingItemId(null);
        setEditingItemName('');
      },
      onError: (err, updatedItem, context) => {
        queryClient.setQueryData(['listItems', selectedListType], context.previousData);
        console.error('Error updating item:', err);
        toast.error(t('admin:errorUpdatingItem'));
      },
      onSettled: () => queryClient.invalidateQueries(['listItems', selectedListType])
    }
  );
  
  const deleteMutation = useMutation(
    (itemId) => adminAPI.deleteListItem(selectedListType, itemId),
    {
      onSuccess: () => toast.success(t('admin:itemDeleted')),
      onError: (err) => toast.error(t('admin:errorDeletingItem')),
      onSettled: () => queryClient.invalidateQueries(['listItems', selectedListType])
    }
  );

  const bulkDeleteMutation = useMutation(
    (itemIds) => adminAPI.bulkDeleteListItems(selectedListType, itemIds),
    {
      onMutate: async (itemIds) => {
        await queryClient.cancelQueries(['listItems', selectedListType]);
        const previousData = queryClient.getQueryData(['listItems', selectedListType]);
        const oldItems = previousData?.items.filter(item => itemIds.includes(item._id));
        addToHistory('bulkDelete', itemIds, oldItems);
        return { previousData };
      },
      onSuccess: () => {
        setSelectedItems([]);
        toast.success(t('admin:itemsDeleted'));
        refetchItems();
      },
      onError: (err, itemIds, context) => {
        queryClient.setQueryData(['listItems', selectedListType], context.previousData);
        console.error('Error deleting items:', err);
        toast.error(t('admin:errorDeletingItems'));
      },
      onSettled: () => queryClient.invalidateQueries(['listItems', selectedListType])
    }
  );

  const handleUndo = () => {
    if (actionIndex < 0) return;
    const action = actionHistory[actionIndex];
    switch (action.action) {
      case 'add': deleteMutation.mutate(action.newData._id); break;
      case 'update': updateMutation.mutate(action.oldData); break;
      case 'delete': addMutation.mutate({ name: action.oldData.name }); break;
      case 'bulkDelete': action.oldData.forEach(item => addMutation.mutate({ name: item.name })); break;
      default: break;
    }
    setActionIndex(actionIndex - 1);
  };
  
  const handleRedo = () => {
    if (actionIndex >= actionHistory.length - 1) return;
    const nextActionIndex = actionIndex + 1;
    const action = actionHistory[nextActionIndex];
    switch (action.action) {
      case 'add': addMutation.mutate({ name: action.newData.name }); break;
      case 'update': updateMutation.mutate(action.newData); break;
      case 'delete': deleteMutation.mutate(action.oldData._id); break;
      case 'bulkDelete': bulkDeleteMutation.mutate(action.newData); break;
      default: break;
    }
    setActionIndex(nextActionIndex);
  };

  const handleEditItem = (itemId) => {
    const itemToEdit = listItems?.items.find(item => item._id === itemId);
    if (itemToEdit) {
      setEditingItemId(itemId);
      setEditingItemName(itemToEdit.name);
    }
  };

  const handleSaveEdit = () => {
    if (!editingItemId) return;
    const itemToUpdate = listItems?.items.find(item => item._id === editingItemId);
    if (itemToUpdate && itemToUpdate.name !== editingItemName) {
      updateMutation.mutate({ ...itemToUpdate, name: editingItemName });
    } else {
      setEditingItemId(null);
    }
  };
  
  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditingItemName('');
  };
  
  const handleAddItem = () => {
    if (newItemName.trim()) {
      addMutation.mutate({ name: newItemName.trim() });
    }
  };

  const handleDeleteItem = (itemId) => {
    if (!itemId) return;
    openConfirmDialog(
      t('admin:confirmDelete'),
      () => {
        const itemToDelete = listItems?.items.find(item => item._id === itemId);
        if(itemToDelete) {
            addToHistory('delete', itemId, itemToDelete);
            deleteMutation.mutate(itemId);
        }
      }
    );
  };

  const handleSearch = useCallback(debounce((value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  }, 300), []);

  const handleSort = (field) => {
    const newOrder = field === sortField && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortOrder(newOrder);
    setCurrentPage(1);
  };

  const handleSelectItem = (itemId) => {
    setSelectedItems(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
  };

  const handleBulkDelete = () => {
    if (selectedItems.length > 0) {
      openConfirmDialog(
        t('admin:confirmBulkDelete', { count: selectedItems.length }),
        () => bulkDeleteMutation.mutate(selectedItems)
      );
    }
  };
  
  const handleExport = () => {
    const dataStr = JSON.stringify(listItems.items, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `${selectedListType}_export.json`);
    linkElement.click();
    toast.success(t('admin:exportSuccess'));
  };

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const items = JSON.parse(e.target.result);
          adminAPI.importListItems(selectedListType, items)
            .then(() => {
              queryClient.invalidateQueries(['listItems', selectedListType]);
              toast.success(t('admin:itemsImported'));
            })
            .catch((error) => toast.error(t('admin:errorImportingItems', { error: error.message })));
        } catch (error) {
          toast.error(t('admin:invalidImportFile'));
        }
      };
      reader.readAsText(file);
    }
  };
  
  const handleQuickAdd = () => {
    const items = quickAddItems.split('\n').map(item => item.trim()).filter(Boolean);
    if(items.length === 0) return;
    Promise.all(items.map(name => addMutation.mutateAsync({ name })))
      .then(() => {
        setQuickAddItems('');
        setIsQuickAddMode(false);
        toast.success(t('admin:itemsAdded', { count: items.length }));
      })
      .catch((error) => toast.error(t('admin:errorAddingItems', { error: error.message || 'Unknown error' })));
  };
  
  const openConfirmDialog = (message, onConfirm) => {
    setConfirmDialog({ isOpen: true, message, onConfirm: () => {
      onConfirm();
      closeConfirmDialog();
    } });
  };
  
  const closeConfirmDialog = () => {
    setConfirmDialog({ isOpen: false, message: '', onConfirm: null });
  };
  
  const renderAdditionalFields = () => {
    switch (selectedListType) {
      case 'educationLevels':
        return (
          <Input
            type="number"
            value={additionalFields.order || ''}
            onChange={(e) => setAdditionalFields({...additionalFields, order: parseInt(e.target.value, 10)})}
            placeholder={t('admin:educationLevelOrder')}
            className="w-40"
          />
        );
      default:
        return null;
    }
  };

  const LoadingIndicator = () => (
    <div className="flex justify-center items-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      <p className="ml-4 text-muted-foreground">{t('admin:loadingItems')}</p>
    </div>
  );

  const renderListSelector = () => (
    <aside className="w-full md:w-64">
      <h3 className="text-lg font-semibold mb-3 px-2">{t('admin:selectList')}</h3>
      <div className="flex flex-col gap-1">
        {listTypes?.map((type) => (
          <Button
            key={type} 
            variant={selectedListType === type ? 'secondary' : 'ghost'}
            onClick={() => setSelectedListType(type)}
            className="w-full justify-start"
          >
            {t(`admin:listTypes.${type}`)}
          </Button>
        ))}
      </div>
    </aside>
  );

  const renderListItem = ({ index, style }) => {
    const item = listItems?.items?.[index];
    if (!item) return null;
  
    const isEditing = editingItemId === item._id;
  
    return (
      <div style={style} className="flex items-center p-2 border-b border-border group transition-colors hover:bg-accent">
        <Checkbox
          checked={selectedItems.includes(item._id)}
          onCheckedChange={() => handleSelectItem(item._id)}
          aria-label={`Select ${item.name}`}
          className="mr-3"
        />
        {isEditing ? (
          <Input
            type="text"
            value={editingItemName}
            onChange={(e) => setEditingItemName(e.target.value)}
            className="flex-1 h-8"
            autoFocus
            onBlur={handleSaveEdit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') handleCancelEdit();
            }}
          />
        ) : (
          <span className="flex-1 truncate" onDoubleClick={() => handleEditItem(item._id)}>{item.name}</span>
        )}
        {typeof item.usageCount === 'number' && item.usageCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground ml-4">
            <Users2 className="h-3 w-3" />
            <span>{item.usageCount}</span>
          </div>
        )}
        <div className="flex items-center ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {isEditing ? (
            <>
              <Button onClick={handleSaveEdit} variant="ghost" size="icon" className="h-8 w-8 text-green-500 hover:text-green-600"><Save size={16} /></Button>
              <Button onClick={handleCancelEdit} variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600"><X size={16} /></Button>
            </>
          ) : (
            <>
              <Button onClick={() => handleEditItem(item._id)} variant="ghost" size="icon" className="h-8 w-8"><Edit size={16} /></Button>
              <Button onClick={() => handleDeleteItem(item._id)} variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive"><Trash2 size={16} /></Button>
            </>
          )}
        </div>
      </div>
    );
  };
  
  const renderPagination = () => (
    <div className="flex justify-center items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm">{t('admin:pageNumber', { current: currentPage, total: listItems?.totalPages || 1 })}</span>
      <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(p + 1, listItems?.totalPages || 1))} disabled={currentPage === listItems?.totalPages}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
  
  const renderListEditor = () => (
    <main className="flex-1">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle>{t(`admin:listTypes.${selectedListType}`)}</CardTitle>
            </div>
            <div className="flex items-center gap-1">
                <Tooltip>
                    <TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleUndo} disabled={actionIndex < 0}><RotateCcw className="h-4 w-4"/></Button></TooltipTrigger>
                    <TooltipContent><p>{t('admin:undoTooltip')}</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleRedo} disabled={actionIndex >= actionHistory.length - 1}><RotateCw className="h-4 w-4"/></Button></TooltipTrigger>
                    <TooltipContent><p>{t('admin:redoTooltip')}</p></TooltipContent>
                </Tooltip>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => document.getElementById('import-file')?.click()}>
                            <Upload className="mr-2 h-4 w-4" /> {t('admin:importList')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={handleExport}>
                            <Download className="mr-2 h-4 w-4" /> {t('admin:exportList')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <input id="import-file" type="file" accept=".json" className="hidden" onChange={handleImport} />
                <Tooltip>
                    <TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setShowHelp(true)}><HelpCircle className="h-5 w-5"/></Button></TooltipTrigger>
                    <TooltipContent><p>{t('admin:help')}</p></TooltipContent>
                </Tooltip>
            </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-2 mb-4">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="text" placeholder={t('admin:searchItems')} onChange={(e) => handleSearch(e.target.value)} className="pl-10"/>
            </div>
            <Button variant="outline" onClick={() => handleSort('name')}>
              <ArrowUpDown className="mr-2 h-4 w-4" />
              {t('admin:sortByName')} {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
            </Button>
          </div>
          <div className="mb-4">
            {isQuickAddMode ? (
              <div className="flex flex-col gap-2">
                <Textarea value={quickAddItems} onChange={(e) => setQuickAddItems(e.target.value)} placeholder={t('admin:quickAddPlaceholder')} rows={4}/>
                <div className="flex gap-2">
                  <Button onClick={handleQuickAdd} disabled={addMutation.isLoading}><Plus className="mr-2 h-4 w-4" /> {t('admin:addItems')}</Button>
                  <Button variant="secondary" onClick={() => setIsQuickAddMode(false)}>{t('common:cancel')}</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <Input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder={t('admin:newItemPlaceholder', { type: t(`admin:listTypes.${selectedListType}`).slice(0, -1) })} className="flex-grow" onKeyDown={(e) => e.key === 'Enter' && handleAddItem()} />
                {renderAdditionalFields()}
                <Button onClick={handleAddItem} disabled={addMutation.isLoading}><Plus className="mr-2 h-4 w-4" />{addMutation.isLoading ? t('admin:adding') : t('admin:addItem')}</Button>
                <Button variant="secondary" onClick={() => setIsQuickAddMode(true)}>{t('admin:bulkAdd')}</Button>
              </div>
            )}
          </div>
          {selectedItems.length > 0 && (
            <div className="mb-4 flex items-center justify-between bg-secondary/20 p-2 rounded-md">
                <p className="text-sm text-secondary-foreground">{t('admin:selectedCount', { count: selectedItems.length })}</p>
                <Button onClick={handleBulkDelete} variant="destructive" size="sm"><Trash className="mr-2 h-4 w-4"/>{t('admin:deleteSelected', { count: selectedItems.length })}</Button>
            </div>
          )}
          {isLoadingItems ? <LoadingIndicator /> : (
            <div className="h-[500px] w-full border rounded-md overflow-hidden">
              <AutoSizer>{({ height, width }) => (<VirtualList height={height} itemCount={listItems?.items?.length || 0} itemSize={48} width={width}>{renderListItem}</VirtualList>)}</AutoSizer>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
            <div className="text-sm text-muted-foreground">{t('admin:totalItems', { count: listItems?.totalItems || 0 })}</div>
            {listItems && listItems.totalPages > 1 && renderPagination()}
        </CardFooter>
      </Card>
    </main>
  );

  const renderWelcomeMessage = () => (
    <div className="flex-1 flex items-center justify-center p-8 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
        <div className="text-center">
            <List className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-xl font-semibold text-foreground">{t('admin:welcomeTitle')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{t('admin:welcomeMessage')}</p>
        </div>
    </div>
  );

  const ScrollToTopButton = () => {
    const [isVisible, setIsVisible] = useState(false);
    const toggleVisibility = () => window.pageYOffset > 300 ? setIsVisible(true) : setIsVisible(false);
    const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
    useEffect(() => {
      window.addEventListener("scroll", toggleVisibility);
      return () => window.removeEventListener("scroll", toggleVisibility);
    }, []);
    return isVisible && <Button onClick={scrollToTop} className="fixed bottom-8 right-8 rounded-full h-12 w-12 shadow-lg z-50">↑</Button>;
  };

  useHotkeys('ctrl+z', handleUndo, [actionIndex, actionHistory]);
  useHotkeys('ctrl+y, ctrl+shift+z', handleRedo, [actionIndex, actionHistory]);
  useHotkeys('ctrl+f', (e) => { e.preventDefault(); document.querySelector('input[placeholder*="Search"]')?.focus(); });
  useHotkeys('ctrl+n', (e) => { e.preventDefault(); document.querySelector('input[placeholder*="new"]')?.focus(); });

  return (
    <TooltipProvider>
      <div className="p-4 md:p-6 lg:p-8">
        <div className="flex flex-col md:flex-row gap-8">
          {renderListSelector()}
          {selectedListType ? renderListEditor() : renderWelcomeMessage()}
        </div>
        <Dialog open={showHelp} onOpenChange={setShowHelp}>
            <DialogContent>
                <DialogHeader><DialogTitle>{t('admin:helpTitle')}</DialogTitle></DialogHeader>
                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                    <li>{t('admin:helpSearch')}</li>
                    <li>{t('admin:helpSort')}</li>
                    <li>{t('admin:helpBulkActions')}</li>
                    <li>{t('admin:helpQuickAdd')}</li>
                    <li>{t('admin:helpUndoRedo')}</li>
                </ul>
            </DialogContent>
        </Dialog>
        <AlertDialog open={confirmDialog.isOpen} onOpenChange={closeConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('admin:confirmAction')}</AlertDialogTitle>
              <AlertDialogDescription>{confirmDialog.message}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDialog.onConfirm}>{t('common:confirm')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <ScrollToTopButton />
      </div>
    </TooltipProvider>
  );
};

export default ListManagement;