import React, { useMemo } from 'react';
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog.tsx';
import { logger } from '../../../utils/logger';
import * as adminAPI from '../../../services/adminAPI';
import DiscountForm from '../../shared/DiscountForm';
import { Skeleton } from '../../ui/skeleton.jsx';
import { toast } from 'react-hot-toast';

const useDiscountFormData = () => {
    return useQuery('discountFormData', adminAPI.getFormData, {
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    });
};

const CreateEditDiscountModal = ({ isOpen, onOpenChange, discount, onSave }) => {
    const { t } = useTranslation(['admin', 'common']);
    const { data: formData, isLoading: isLoadingFormData } = useDiscountFormData();

    const { scopeOptions, entityOptions, coachOptions } = useMemo(() => {
        const scopeOpts = [
            { value: 'all_programs', label: t('scope.all_programs', 'All Programs') },
            { value: 'specific_programs', label: t('scope.specific_programs', 'Specific Programs') },
            { value: 'all_sessions', label: t('scope.all_sessions', 'All Sessions') },
            { value: 'specific_session_types', label: t('scope.specific_session_types', 'Specific Session Types') },
        ];

        const entityOpts = {
            programs: formData?.programs.map(p => ({ value: p._id, label: p.title })) || [],
            sessionTypes: formData?.sessionTypes.map(st => ({ value: st._id, label: st.name })) || [],
        };

        const coachOpts = formData?.coaches.map(c => ({ value: c._id, label: `${c.firstName} ${c.lastName}` })) || [];

        return { scopeOptions: scopeOpts, entityOptions: entityOpts, coachOptions: coachOpts };
    }, [t, formData]);

     const handleSaveWrapper = async (data) => {
        logger.info('[CreateEditDiscountModal] Saving discount data', { discountId: data._id, data });

        await onSave(data);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent draggable fullscreenable resizable className="max-w-md md:max-w-3xl lg:max-w-5xl max-h-[90vh] flex flex-col p-0">
                <DialogHeader data-dialog-drag-handle="true" className="cursor-move border-b px-4 sm:px-6 py-4 shrink-0 pr-20">
                    <DialogTitle className="text-xl">{discount ? t('financials.editDiscount') : t('financials.createDiscount')}</DialogTitle>
                    <DialogDescription>{t('financials.createDiscountDesc')}</DialogDescription>
                </DialogHeader>
                {isLoadingFormData ? (
                    <div className="p-6 space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                ) : (
                    <DiscountForm
                        key={discount?._id || 'new'}
                        initialData={discount}
                        onSubmit={handleSaveWrapper}
                        onClose={() => onOpenChange(false)}
                        scopeOptions={scopeOptions}
                        entityOptions={entityOptions}
                        coachOptions={coachOptions}
                        isLoading={false} // The parent component's mutation state will be used.
                    />
                )}
            </DialogContent>
        </Dialog>
    );
};

export default CreateEditDiscountModal;