import React, { useState } from 'react';
import { useAnnouncements, useCreateAnnouncement, useUpdateAnnouncement, useDeleteAnnouncement } from '../../../hooks/useAnnouncements';
import { Button } from '../../ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../../ui/dialog.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table.tsx';
import { Switch } from '../../ui/switch.tsx';
import { Textarea } from '../../ui/textarea.tsx';
import { Label } from '../../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx';
import { Input } from '../../ui/input.tsx';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Skeleton } from '../../ui/skeleton.jsx';
import { PlusCircle, Edit, Trash2, Loader2, Info, AlertTriangle, AlertOctagon, Users, Globe, Eye, MousePointerClick } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../ui/alert-dialog.tsx';
import { Badge } from '../../ui/badge.tsx';
import { MultiSelect } from '../../ui/multi-select.tsx'; 

const AnnouncementForm = ({ announcement, onSave, isLoading }) => {
    const { t } = useTranslation(['admin', 'common']);
    const [formData, setFormData] = useState(
        announcement || { 
            content: '', 
            type: 'info', 
            isActive: true, 
            startDate: '', 
            endDate: '',
            displayLocation: 'global_banner',
            targetedRoles: [],
            actionUrl: '',
            actionText: ''
        }
    );

    const roleOptions = [
        { value: 'client', label: t('roles.client', 'Client') },
        { value: 'coach', label: t('roles.coach', 'Coach') },
        { value: 'admin', label: t('roles.admin', 'Admin') },
    ];

    const handleInputChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };
    
    const handleValueChange = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = {
            ...formData,
            startDate: formData.startDate || null,
            endDate: formData.endDate || null,
        };
        onSave(payload);
    };
    
    const getBannerStyle = (type) => {
        switch (type) {
            case 'warning': return 'bg-yellow-100 border-yellow-500 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-700/50 dark:text-yellow-300';
            case 'critical': return 'bg-red-100 border-red-500 text-red-800 dark:bg-red-900/20 dark:border-red-700/50 dark:text-red-300';
            default: return 'bg-blue-100 border-blue-500 text-blue-800 dark:bg-blue-900/20 dark:border-blue-700/50 dark:text-blue-300';
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="content">{t('system.announcements.form.content')}</Label>
                <Textarea id="content" value={formData.content} onChange={handleInputChange} required placeholder={t('system.announcements.form.contentPlaceholder', 'Enter announcement content here...')}/>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Label htmlFor="displayLocation">{t('system.announcements.form.displayLocation')}</Label>
                    <Select value={formData.displayLocation} onValueChange={(value) => handleValueChange('displayLocation', value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="global_banner">{t('system.announcements.locations.global_banner')}</SelectItem>
                            <SelectItem value="dashboard_widget">{t('system.announcements.locations.dashboard_widget')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="type">{t('system.announcements.form.type')}</Label>
                    <Select value={formData.type} onValueChange={(value) => handleValueChange('type', value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="info">{t('system.announcements.types.info')}</SelectItem>
                            <SelectItem value="warning">{t('system.announcements.types.warning')}</SelectItem>
                            <SelectItem value="critical">{t('system.announcements.types.critical')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="targetedRoles">{t('system.announcements.form.targetedRoles')}</Label>
                <MultiSelect
                    options={roleOptions}
                    selected={formData.targetedRoles}
                    onChange={(selected) => handleValueChange('targetedRoles', selected)}
                    placeholder={t('system.announcements.form.targetedRolesPlaceholder')}
                />
                <p className="text-xs text-muted-foreground mt-1">{t('system.announcements.form.targetedRolesDesc')}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="actionText">{t('system.announcements.form.actionText')}</Label>
                    <Input id="actionText" value={formData.actionText || ''} onChange={handleInputChange} placeholder={t('system.announcements.form.actionTextPlaceholder')} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="actionUrl">{t('system.announcements.form.actionUrl')}</Label>
                    <Input id="actionUrl" value={formData.actionUrl || ''} onChange={handleInputChange} placeholder="https://..." />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="startDate">{t('system.announcements.form.startDate')}</Label>
                    <Input id="startDate" type="datetime-local" value={formData.startDate ? formData.startDate.substring(0, 16) : ''} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="endDate">{t('system.announcements.form.endDate')}</Label>
                    <Input id="endDate" type="datetime-local" value={formData.endDate ? formData.endDate.substring(0, 16) : ''} onChange={handleInputChange} />
                </div>
            </div>
            
            <div className="flex items-center space-x-2 pt-2">
                <Switch id="isActive" checked={formData.isActive} onCheckedChange={(checked) => handleValueChange('isActive', checked)} />
                <Label htmlFor="isActive" className="cursor-pointer">{t('system.announcements.form.active')}</Label>
            </div>
             
            <div className="space-y-2">
                <Label>{t('system.announcements.form.preview')}</Label>
                <div className={`mt-2 p-4 border rounded-md text-sm flex items-center justify-between gap-3 ${getBannerStyle(formData.type)}`}>
                    <div className="flex items-center gap-3">
                        {formData.type === 'info' && <Info className="h-5 w-5 flex-shrink-0" />}
                        {formData.type === 'warning' && <AlertTriangle className="h-5 w-5 flex-shrink-0" />}
                        {formData.type === 'critical' && <AlertOctagon className="h-5 w-5 flex-shrink-0" />}
                        <span className="break-words">{formData.content || t('system.announcements.form.previewText')}</span>
                    </div>
                    {formData.actionUrl && formData.actionText && (
                        <span className="ml-4 whitespace-nowrap inline-block rounded-md border border-transparent bg-white px-3 py-1.5 text-xs font-semibold text-gray-900">
                            {formData.actionText}
                        </span>
                    )}
                </div>
            </div>
            <DialogFooter className="pt-4">
                <Button type="submit" disabled={isLoading}>{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('common:save')}</Button>
            </DialogFooter>
        </form>
    );
};


const AnnouncementManager = () => {
    const { t } = useTranslation(['admin']);
    const { data: announcements, isLoading } = useAnnouncements();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selected, setSelected] = useState(null);
    const [deleteDialogItem, setDeleteDialogItem] = useState(null);

    const createMutation = useCreateAnnouncement();
    const updateMutation = useUpdateAnnouncement();
    const deleteMutation = useDeleteAnnouncement();

    const handleSave = (data) => {
        const mutation = selected ? updateMutation : createMutation;
        const payload = selected ? { id: selected._id, updateData: data } : data;

        mutation.mutate(payload, {
            onSuccess: () => {
                toast.success(t(selected ? 'system.announcements.toast.updateSuccess' : 'system.announcements.toast.createSuccess'));
                setDialogOpen(false);
                setSelected(null);
            },
            onError: (err) => toast.error(err.response?.data?.message || t('common:errorGeneric'))
        });
    };
    
    const handleDelete = () => {
        if (!deleteDialogItem) return;
        deleteMutation.mutate(deleteDialogItem._id, {
            onSuccess: () => {
                toast.success(t('system.announcements.toast.deleteSuccess'));
                setDeleteDialogItem(null);
            },
            onError: (err) => toast.error(err.response?.data?.message || t('common:errorGeneric'))
        })
    }
    
    const getTargetingInfo = (item) => {
        if (item.targetedUsers && item.targetedUsers.length > 0) {
            return `${item.targetedUsers.length} ${t('system.announcements.table.specificUsers')}`;
        }
        if (item.targetedRoles && item.targetedRoles.length > 0) {
            return item.targetedRoles.map(r => t(`roles.${r}`, r)).join(', ');
        }
        return <Globe className="h-4 w-4 text-muted-foreground" title={t('system.announcements.table.allUsers')} />;
    };

    const isMutationLoading = createMutation.isLoading || updateMutation.isLoading;

    return (
        <div className="flex flex-col h-full bg-card md:rounded-lg md:border">
            <div className="p-4 border-b flex justify-between items-center">
                <h2 className="text-lg font-semibold">{t('system.announcements.title')}</h2>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild><Button onClick={() => setSelected(null)}><PlusCircle className="mr-2 h-4 w-4" />{t('system.announcements.create')}</Button></DialogTrigger>
                    <DialogContent className="sm:max-w-3xl" fullscreenable>
                        <DialogHeader>
                            <DialogTitle draggable>{t(selected ? 'system.announcements.editTitle' : 'system.announcements.createTitle')}</DialogTitle>
                            <DialogDescription>{t('system.announcements.createDesc')}</DialogDescription>
                        </DialogHeader>
                        <AnnouncementForm announcement={selected} onSave={handleSave} isLoading={isMutationLoading} />
                    </DialogContent>
                </Dialog>
            </div>
            <div className="overflow-auto flex-grow">
                <Table>
                     <TableHeader>
                        <TableRow>
                            <TableHead className="w-2/5">{t('system.announcements.table.content')}</TableHead>
                            <TableHead>{t('system.announcements.table.targeting')}</TableHead>
                            <TableHead className="hidden md:table-cell">{t('system.announcements.table.location')}</TableHead>
                            <TableHead className="hidden lg:table-cell">{t('system.announcements.table.stats')}</TableHead>
                            <TableHead>{t('system.announcements.table.status')}</TableHead>
                            <TableHead className="text-right">{t('common:actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                             Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell></TableRow>)
                        ) : (
                            announcements?.map(item => (
                                <TableRow key={item._id}>
                                    <TableCell className="max-w-xs truncate font-medium">{item.content}</TableCell>
                                    <TableCell className="text-xs capitalize">{getTargetingInfo(item)}</TableCell>
                                    <TableCell className="hidden md:table-cell"><Badge variant="secondary" className="whitespace-nowrap">{t(`system.announcements.locations.${item.displayLocation}`)}</Badge></TableCell>
                                     <TableCell className="hidden lg:table-cell">
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1" title={t('system.announcements.table.views', 'Views')}><Eye className="h-3 w-3" /> {item.viewCount || 0}</div>
                                            <div className="flex items-center gap-1" title={t('system.announcements.table.clicks', 'Clicks')}><MousePointerClick className="h-3 w-3" /> {item.clickCount || 0}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell><Switch checked={item.isActive} onCheckedChange={(checked) => updateMutation.mutate({ id: item._id, updateData: { isActive: checked }})} /></TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => { setSelected(item); setDialogOpen(true); }}><Edit className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" onClick={() => setDeleteDialogItem(item)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
             <AlertDialog open={!!deleteDialogItem} onOpenChange={(open) => !open && setDeleteDialogItem(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>{t('system.announcements.confirm.deleteTitle')}</AlertDialogTitle><AlertDialogDescription>{t('system.announcements.confirm.deleteDesc')}</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={deleteMutation.isLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{deleteMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('common:delete')}</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default AnnouncementManager;