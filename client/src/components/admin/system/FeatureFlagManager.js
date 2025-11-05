import React, { useState, useEffect, useMemo } from 'react';
import { useFeatureFlags, useCreateFeatureFlag, useUpdateFeatureFlag, useDeleteFeatureFlag, useAdminUsers, useAdminUserRoles, useAdminUniqueUserCountries } from '../../../hooks/useAdmin';
import { Button } from '../../ui/button.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table.tsx';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose } from '../../ui/sheet.jsx';
import { Input } from '../../ui/input.tsx';
import { Label } from '../../ui/label.tsx';
import { Textarea } from '../../ui/textarea.tsx';
import { Switch } from '../../ui/switch.tsx';
import { Slider } from '../../ui/slider.tsx';
import { MultiSelect } from '../../ui/multi-select.tsx';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../ui/skeleton.jsx';
import { PlusCircle, Edit, Trash2, MoreHorizontal, Loader2, User, Globe, ChevronsUpDown, XCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../ui/dropdown-menu.tsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../ui/alert-dialog.tsx';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../../ui/command.jsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover.jsx';
import { Badge } from '../../ui/badge.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip.tsx';

const UserSearch = ({ selected, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const selectedUserIds = useMemo(() => new Set(selected.map(u => u.value)), [selected]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    const { data: searchResults, isLoading } = useAdminUsers({ search: debouncedSearch, limit: 10, role: '' });
    const userOptions = searchResults?.users.map(u => ({ value: u._id, label: `${u.firstName} ${u.lastName} (${u.email})` })) || [];

    const handleSelect = (user) => {
        if (!selectedUserIds.has(user.value)) {
            onChange([...selected, user]);
        }
        setOpen(false);
        setSearch('');
    };

    const handleRemove = (userId) => {
        onChange(selected.filter(u => u.value !== userId));
    };

    return (
        <div className="space-y-2">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        Select users...
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                        <CommandInput placeholder="Search by name or email..." value={search} onValueChange={setSearch} />
                        <CommandList>
                            {isLoading && <div className="p-2 text-sm text-muted-foreground">Loading...</div>}
                            <CommandEmpty>{!isLoading && 'No users found.'}</CommandEmpty>
                            <CommandGroup>
                                {userOptions.map((user) => (
                                    <CommandItem key={user.value} onSelect={() => handleSelect(user)} disabled={selectedUserIds.has(user.value)}>
                                        {user.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            <div className="flex flex-wrap gap-1">
                {selected.map(user => (
                    <Badge key={user.value} variant="secondary">
                        {user.label}
                        <XCircle className="ml-1.5 h-3.5 w-3.5 cursor-pointer hover:text-foreground" onClick={() => handleRemove(user.value)} />
                    </Badge>
                ))}
            </div>
        </div>
    );
};

const FeatureFlagForm = ({ initialData, onSave, isLoading }) => {
    const { t } = useTranslation(['admin', 'common']);
    const [formData, setFormData] = useState(initialData);
    const [keyError, setKeyError] = useState('');
    const [selectedUsers, setSelectedUsers] = useState([]);

    const { data: roles, isLoading: rolesLoading } = useAdminUserRoles();
    const { data: countries, isLoading: countriesLoading } = useAdminUniqueUserCountries();

    const { data: initialUsersData } = useAdminUsers({
        userIds: initialData.targetedUsers,
        limit: initialData.targetedUsers?.length || 1,
    }, {
        enabled: !!initialData._id && !!initialData.targetedUsers?.length,
    });

    useEffect(() => {
        if (initialUsersData?.users) {
            setSelectedUsers(initialUsersData.users.map(u => ({ value: u._id, label: `${u.firstName} ${u.lastName} (${u.email})` })));
        } else if (!initialData.targetedUsers?.length) {
            setSelectedUsers([]);
        }
    }, [initialUsersData, initialData.targetedUsers]);
    
    useEffect(() => {
        setFormData(prev => ({ ...prev, targetedUsers: selectedUsers.map(u => u.value) }));
    }, [selectedUsers]);


    const handleInputChange = (e) => {
        const { id, value } = e.target;
        if (id === 'key') {
            setKeyError('');
            const validKey = value.replace(/[^a-zA-Z0-9_.-]/g, '');
            setFormData(prev => ({...prev, [id]: validKey }));
        } else {
            setFormData(prev => ({...prev, [id]: value }));
        }
    };

    const handleValueChange = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.key) {
            setKeyError(t('common:validation.required'));
            return;
        }
        onSave(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="key">{t('system.features.form.key.label')}</Label>
                <Input id="key" value={formData.key} onChange={handleInputChange} disabled={!!initialData._id} placeholder="e.g., new-dashboard-view" />
                {keyError && <p className="text-sm text-destructive">{keyError}</p>}
                 <p className="text-xs text-muted-foreground">{t('system.features.form.key.hint', 'Only letters, numbers, hyphens, underscores, and periods are allowed.')}</p>
            </div>
            <div className="space-y-2">
                <Label htmlFor="description">{t('system.features.form.description.label')}</Label>
                <Textarea id="description" value={formData.description} onChange={handleInputChange} />
            </div>
            <div className="flex items-center justify-between">
                <Label htmlFor="isActive">{t('system.features.form.active.label')}</Label>
                <Switch id="isActive" checked={formData.isActive} onCheckedChange={(checked) => handleValueChange('isActive', checked)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="rolloutPercentage">{t('system.features.form.rollout.label')} ({formData.rolloutPercentage}%)</Label>
                <Slider id="rolloutPercentage" min={0} max={100} step={1} value={[formData.rolloutPercentage]} onValueChange={(value) => handleValueChange('rolloutPercentage', value[0])} />
            </div>
             <div className="space-y-2">
                <Label>{t('system.features.form.roles.label')}</Label>
                <MultiSelect options={roles || []} selected={formData.targetedRoles} onChange={(value) => handleValueChange('targetedRoles', value)} placeholder={t('system.features.form.roles.placeholder')} isLoading={rolesLoading} />
            </div>
            <div className="space-y-2">
                <Label>{t('system.features.form.users.label')}</Label>
                <UserSearch selected={selectedUsers} onChange={setSelectedUsers} />
            </div>
            <div className="space-y-2">
                <Label>{t('system.features.form.countries.label')}</Label>
                <MultiSelect options={countries || []} selected={formData.targetedCountries} onChange={(value) => handleValueChange('targetedCountries', value)} placeholder={t('system.features.form.countries.placeholder')} isLoading={countriesLoading} />
            </div>
            <SheetFooter>
                <SheetClose asChild><Button type="button" variant="outline">{t('common:cancel')}</Button></SheetClose>
                <Button type="submit" disabled={isLoading}>{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('common:save')}</Button>
            </SheetFooter>
        </form>
    );
};

const FeatureFlagManager = () => {
    const { t } = useTranslation(['admin', 'common']);
    const { data: flags, isLoading: isLoadingFlags } = useFeatureFlags();
    const [sheetOpen, setSheetOpen] = useState(false);
    const [selectedFlag, setSelectedFlag] = useState(null);
    const [deleteDialogFlag, setDeleteDialogFlag] = useState(null);

    const createMutation = useCreateFeatureFlag();
    const updateMutation = useUpdateFeatureFlag();
    const deleteMutation = useDeleteFeatureFlag();

    const handleSave = (data) => {
        const mutation = selectedFlag ? updateMutation : createMutation;
        const payload = selectedFlag ? { flagId: selectedFlag._id, updateData: data } : data;
        
        mutation.mutate(payload, {
            onSuccess: () => {
                toast.success(t(selectedFlag ? 'system.features.toast.updateSuccess' : 'system.features.toast.createSuccess'));
                setSheetOpen(false);
                setSelectedFlag(null);
            },
            onError: (err) => toast.error(err.response?.data?.message || t('common:errorGeneric'))
        });
    };

    const openSheetForEdit = (flag) => {
        setSelectedFlag(flag);
        setSheetOpen(true);
    };

    const openSheetForCreate = () => {
        setSelectedFlag(null);
        setSheetOpen(true);
    };

    const handleDelete = () => {
        if (!deleteDialogFlag) return;
        deleteMutation.mutate(deleteDialogFlag._id, {
            onSuccess: () => {
                toast.success(t('system.features.toast.deleteSuccess'));
                setDeleteDialogFlag(null);
            },
            onError: (err) => toast.error(err.response?.data?.message || t('common:errorGeneric'))
        });
    };
    
    const isMutationLoading = createMutation.isLoading || updateMutation.isLoading;
    
    const sheetInitialData = selectedFlag ? {
            ...selectedFlag,
            targetedUsers: selectedFlag.targetedUsers || [],
            targetedRoles: selectedFlag.targetedRoles || [],
            targetedCountries: selectedFlag.targetedCountries || [],
        } : {
            key: '', description: '', isActive: false, rolloutPercentage: 0, targetedUsers: [], targetedRoles: [], targetedCountries: []
        };

   return (
        <div className="flex flex-col h-full bg-card md:rounded-lg md:border">
            <div className="p-4 border-b flex justify-between items-center">
                <h2 className="text-lg font-semibold">{t('system.features.title')}</h2>
                <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                    <SheetTrigger asChild><Button onClick={openSheetForCreate}><PlusCircle className="mr-2 h-4 w-4" />{t('system.features.create')}</Button></SheetTrigger>
                    <SheetContent className="sm:max-w-lg">
                        <SheetHeader>
                            <SheetTitle>{t(selectedFlag ? 'system.features.editTitle' : 'system.features.createTitle')}</SheetTitle>
                            <SheetDescription>{t(selectedFlag ? 'system.features.editDesc' : 'system.features.createDesc')}</SheetDescription>
                        </SheetHeader>
                        <div className="py-6">
                            <FeatureFlagForm initialData={sheetInitialData} onSave={handleSave} isLoading={isMutationLoading} />
                        </div>
                    </SheetContent>
                </Sheet>
            </div>
            <div className="overflow-auto flex-grow">
    <Table>
        <TableHeader>
            <TableRow>
                <TableHead>{t('system.features.table.key')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('system.features.table.description')}</TableHead>
                <TableHead>{t('system.features.table.status')}</TableHead>
                <TableHead>{t('system.features.table.rollout')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('system.features.table.targeting')}</TableHead>
                <TableHead className="hidden xl:table-cell">{t('system.features.table.lastModified')}</TableHead>
                <TableHead className="text-right">{t('common:actions')}</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            {isLoadingFlags ? (
                Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-10 w-full" /></TableCell></TableRow>)
            ) : (
                flags?.map(flag => (
                    <TableRow key={flag._id}>
                        <TableCell className="font-mono text-sm">{flag.key}</TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground text-sm truncate max-w-xs">{flag.description}</TableCell>
                        <TableCell>
                            <Switch 
                                checked={flag.isActive} 
                                onCheckedChange={(checked) => updateMutation.mutate({ flagId: flag._id, updateData: { isActive: checked }})}
                                disabled={updateMutation.isLoading && updateMutation.variables?.flagId === flag._id}
                            />
                        </TableCell>
                        <TableCell>{flag.rolloutPercentage}%</TableCell>
                        <TableCell className="hidden md:table-cell">
                            <div className="flex items-center gap-2">
                                {(flag.targetedUsers?.length > 0 || flag.targetedRoles?.length > 0) && 
                                    <TooltipProvider><Tooltip><TooltipTrigger>
                                        <User className="h-4 w-4" />
                                    </TooltipTrigger><TooltipContent>
                                        {flag.targetedRoles?.length > 0 && <p>{t('system.features.targeting.roles', 'Roles: {{roles}}', { roles: flag.targetedRoles.join(', ') })}</p>}
                                        {flag.targetedUsers?.length > 0 && <p>{t('system.features.targeting.users', '{{count}} specific users', { count: flag.targetedUsers.length })}</p>}
                                    </TooltipContent></Tooltip></TooltipProvider>
                                }
                                {flag.targetedCountries?.length > 0 && 
                                    <TooltipProvider><Tooltip><TooltipTrigger>
                                        <Globe className="h-4 w-4" />
                                    </TooltipTrigger><TooltipContent>
                                        <p>{t('system.features.targeting.countries', 'Countries: {{countries}}', { countries: flag.targetedCountries.join(', ') })}</p>
                                    </TooltipContent></Tooltip></TooltipProvider>
                                }
                            </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                            {flag.lastModifiedBy ? (
                                <div>
                                    <div>{flag.lastModifiedBy.firstName} {flag.lastModifiedBy.lastName}</div>
                                    <div className="text-gray-400">{flag.updatedAt ? new Date(flag.updatedAt).toLocaleString() : ''}</div>
                                </div>
                            ) : (t('common:na', 'N/A'))}
                        </TableCell>
                        <TableCell className="text-right">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => openSheetForEdit(flag)}><Edit className="mr-2 h-4 w-4" />{t('common:edit')}</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setDeleteDialogFlag(flag)} className="text-destructive focus:text-destructive focus:bg-destructive/10"><Trash2 className="mr-2 h-4 w-4" />{t('common:delete')}</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                ))
            )}
        </TableBody>
    </Table>
</div>
             <AlertDialog open={!!deleteDialogFlag} onOpenChange={(open) => !open && setDeleteDialogFlag(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('system.features.confirm.deleteTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('system.features.confirm.deleteDesc', 'This will permanently delete the feature flag "{{key}}". This action cannot be undone.', {key: deleteDialogFlag?.key})}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={deleteMutation.isLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{deleteMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('common:delete')}</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default FeatureFlagManager;