import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button.tsx';
import { X } from 'lucide-react';

const ActiveFiltersDisplay = ({ filters, onFilterChange, resetFilters, hasActiveFilters, filterConfig }) => {
    const { t } = useTranslation(['programs', 'common']);

    const activePills = useMemo(() => {
        const pills = [];
        
        filterConfig.forEach(filter => {
            const currentValue = filters[filter.id];
            const initialValue = filter.initialValue;

            // Handle string-based search filter
            if (typeof currentValue === 'string' && currentValue.trim() !== initialValue) {
                pills.push({
                    id: filter.id,
                    value: `"${currentValue}"`,
                    remove: () => onFilterChange(filter.id, initialValue)
                });
            } 
            // Handle all array-based filters
            else if (Array.isArray(currentValue)) {
                // Price range slider (special array case)
                if (filter.id === 'price') {
                    if (currentValue[0] !== initialValue[0] || currentValue[1] !== initialValue[1]) {
                        const priceLabel = `$${currentValue[0]} - ${currentValue[1] >= 1000 ? '$1000+' : `$${currentValue[1]}`}`;
                        pills.push({ id: 'price', value: priceLabel, remove: () => onFilterChange('price', initialValue) });
                    }
                }
                // Arrays of objects from SearchableListSelector or LearningOutcomeFilter
                else if (['categories', 'language', 'skillLevel', 'learningOutcomes', 'author'].includes(filter.id)) {
                    currentValue.forEach(item => {
                        // Use translation if available, fallback to name
                        const translatedValue = item.translation ? t(item.translation) : item.name;
                        pills.push({
                            id: `${filter.id}-${item._id}`,
                            value: translatedValue,
                            remove: () => onFilterChange(filter.id, currentValue.filter(i => i._id !== item._id))
                        });
                    });
                }
                // Arrays of strings from CheckboxFilterGroup
                else if (filter.props?.options && currentValue.length > 0) {
                    currentValue.forEach(val => {
                        const option = filter.props.options.find(o => o.id === val);
                        if (option) {
                            pills.push({
                                id: `${filter.id}-${val}`,
                                value: t(option.labelKey, { defaultValue: option.labelDefault }),
                                remove: () => onFilterChange(filter.id, currentValue.filter(v => v !== val))
                            });
                        }
                    });
                }
            }
        });
        return pills;
    }, [filters, onFilterChange, t, filterConfig]);

    if (!hasActiveFilters) return null;

    return (
        <div className="flex flex-wrap items-center gap-2 mb-6">
            {activePills.map(pill => (
                <div
                    key={pill.id}
                    className="inline-flex items-center gap-x-1.5 rounded-full border border-indigo-200 bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                >
                    <span className="leading-none">{pill.value}</span>
                    <button
                        type="button"
                        onClick={pill.remove}
                        className="flex-shrink-0 rounded-full p-0.5 text-indigo-600 hover:bg-indigo-200/60 hover:text-indigo-900 focus:outline-none focus:ring-1 focus:ring-ring dark:text-indigo-400 dark:hover:bg-indigo-800/80 dark:hover:text-indigo-100"
                        aria-label={`${t('common:remove')} ${pill.value}`}
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            ))}
            {activePills.length > 0 && (
                <Button
                    variant="link"
                    size="sm"
                    onClick={resetFilters}
                    className="h-auto p-0 text-sm font-normal text-primary hover:text-primary/80"
                >
                    {t('clear_all')}
                </Button>
            )}
        </div>
    );
};

export default ActiveFiltersDisplay;