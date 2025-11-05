import React from 'react';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion.jsx';
import { Slider } from '../ui/slider.tsx';
import { Input } from '../ui/input.tsx';
import SearchableListSelector from '../SearchableListSelector';
import CheckboxFilterGroup from './CheckboxFilterGroup';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';
import LearningOutcomeFilter from './LearningOutcomeFilter';
import AuthorFilter from './AuthorFilter';

// Redesigned PriceFilter with styling consistent with FilterSidebar.js
const PriceFilter = ({ value, onChange }) => {
    const { t } = useTranslation('programs');
    const [minInput, setMinInput] = React.useState(value[0]);
    const [maxInput, setMaxInput] = React.useState(value[1] >= 1000 ? '1000+' : value[1]);

    React.useEffect(() => {
        setMinInput(value[0]);
        setMaxInput(value[1] >= 1000 ? '1000+' : value[1]);
    }, [value]);

    const handleBlur = () => {
        let newMin = parseInt(minInput, 10) || 0;
        let newMax = parseInt(String(maxInput).replace('+', ''), 10) || 1000;
        
        if (newMin < 0) newMin = 0;
        if (newMax > 1000) newMax = 1000;
        if (newMin > newMax) newMin = newMax;
        
        onChange([newMin, newMax]);
    };
    
    return (
        <div className="space-y-4 px-1">
            <Slider
                min={0} max={1000} step={10} value={value}
                onValueChange={onChange}
                className="my-4"
            />
            <div className="flex items-center gap-2">
                <Input
                    type="number"
                    value={minInput}
                    onChange={(e) => setMinInput(e.target.value)}
                    onBlur={handleBlur}
                    aria-label={t('min_price_label')}
                    className="w-full"
                />
                <div className="flex-shrink-0 text-muted-foreground">-</div>
                <Input
                    type="text"
                    value={maxInput}
                    onChange={(e) => setMaxInput(e.target.value)}
                    onBlur={handleBlur}
                    aria-label={t('max_price_label')}
                    className="w-full"
                />
            </div>
        </div>
    );
};

const filterConfig = [
    { id: 'learningOutcomes', labelKey: 'filter_learning_outcome', component: LearningOutcomeFilter, props: { placeholderKey: 'programs:select_learning_outcomes' }, initialValue: [], useOnUpdate: true },
    { id: 'author', labelKey: 'filter_author', component: AuthorFilter, props: { placeholderKey: 'programs:select_authors' }, initialValue: [], useOnUpdate: true },
    { id: 'categories', labelKey: 'field_category_label', component: SearchableListSelector, props: { listType: 'programCategories', isFilter: true, isMulti: true, placeholderKey: 'programs:select_categories' }, initialValue: [], useOnUpdate: true },
    { id: 'language', labelKey: 'common:language', component: SearchableListSelector, props: { listType: 'languages', isFilter: true, isMulti: true, placeholderKey: 'common:select_language_placeholder' }, initialValue: [], useOnUpdate: true },
    { id: 'skillLevel', labelKey: 'skill_level', component: SearchableListSelector, props: { listType: 'skillLevels', isFilter: true, isMulti: true, placeholderKey: 'programs:select_skill_level_placeholder' }, initialValue: [], useOnUpdate: true },
    { id: 'price', labelKey: 'price_range', component: PriceFilter, props: {}, initialValue: [0, 1000] },
    {
        id: 'contentTypes', labelKey: 'filter_content_types', component: CheckboxFilterGroup, props: {
            options: [
                { id: 'video', labelKey: 'contentType_video', labelDefault: 'Video' },
                { id: 'text', labelKey: 'contentType_text', labelDefault: 'Text/Reading' },
                { id: 'quiz', labelKey: 'contentType_quiz', labelDefault: 'Quiz' },
                { id: 'assignment', labelKey: 'contentType_assignment', labelDefault: 'Assignment' },
                { id: 'presentation', labelKey: 'contentType_presentation', labelDefault: 'Presentation' },
            ]
        }, initialValue: []
    },
    {
        id: 'contentDuration', labelKey: 'filter_content_duration', component: CheckboxFilterGroup, props: {
            options: [
                { id: '0-60', labelKey: 'duration_under_1h', labelDefault: 'Under 1 hour' },
                { id: '61-180', labelKey: 'duration_1_3h', labelDefault: '1 - 3 hours' },
                { id: '181-300', labelKey: 'duration_3_5h', labelDefault: '3 - 5 hours' },
                { id: '301-999999', labelKey: 'duration_over_5h', labelDefault: '5+ hours' },
            ]
        }, initialValue: []
    },
    {
        id: 'estimatedCompletionTime', labelKey: 'filter_completion_time', component: CheckboxFilterGroup, props: {
            options: [
                { id: '0-60', labelKey: 'duration_under_1h', labelDefault: 'Under 1 hour' },
                { id: '61-180', labelKey: 'duration_1_3h', labelDefault: '1 - 3 hours' },
                { id: '181-300', labelKey: 'duration_3_5h', labelDefault: '3 - 5 hours' },
                { id: '301-999999', labelKey: 'duration_over_5h', labelDefault: '5+ hours' },
            ]
        }, initialValue: []
    },
];

const ProgramsFilterSidebar = ({ filters, onFilterChange }) => {
    const { t } = useTranslation(['programs', 'common']);

    const isFilterActive = (filter) => {
        const currentValue = filters[filter.id];
        const initialValue = filter.initialValue;
        if (Array.isArray(currentValue)) {
             // Price filter has a different initial value structure
            if (filter.id === 'price') return JSON.stringify(currentValue) !== JSON.stringify(initialValue);
            return currentValue.length > 0;
        }
        return currentValue !== initialValue;
    };

    const defaultOpenItems = React.useMemo(() => 
        filterConfig.filter(f => isFilterActive(f)).map(f => f.id)
    , [filters]);

    return (
        <Accordion type="multiple" defaultValue={defaultOpenItems} className="w-full">
            {filterConfig.map(filter => {
                const FilterComponent = filter.component;
                const value = filters[filter.id];
                const handleChange = (newValue) => onFilterChange(filter.id, newValue);

                const componentProps = { ...filter.props };
                if (componentProps.placeholderKey) {
                    componentProps.placeholder = t(componentProps.placeholderKey);
                    delete componentProps.placeholderKey;
                }

                const onChangeProp = filter.component === Input 
                    ? { onChange: (e) => handleChange(e.target.value) }
                    : { onChange: handleChange };
                
                if (filter.useOnUpdate) {
                    onChangeProp.onUpdate = handleChange;
                    delete onChangeProp.onChange;
                }

                return (
                    <AccordionItem 
                        key={filter.id} 
                        value={filter.id}
                        className={filter.id === 'learningOutcomes' ? 'relative data-[state=open]:z-10' : ''}
                    >
                        <AccordionTrigger className="text-base font-medium hover:no-underline">
                            <div className="flex items-center gap-2">
                                <span>{t(filter.labelKey)}</span>
                                {isFilterActive(filter) && <div className="w-2 h-2 rounded-full bg-primary" />}
                                {filter.tooltipKey && (
                                    <TooltipProvider delayDuration={100}>
                                        <Tooltip>
                                            <TooltipTrigger asChild onClick={(e) => e.preventDefault()}>
                                                <Info className="h-4 w-4 text-muted-foreground/70" />
                                            </TooltipTrigger>
                                            <TooltipContent><p className="max-w-xs">{t(filter.tooltipKey)}</p></TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                 )}
                            </div>
                        </AccordionTrigger>
                       <AccordionContent className={filter.id === 'learningOutcomes' ? 'data-[state=open]:overflow-visible' : ''}>
                            <FilterComponent 
                                {...componentProps} 
                                value={value} 
                                selectedItems={value}
                                selectedValues={value}
                                {...onChangeProp} 
                            />
                        </AccordionContent>
                    </AccordionItem>
                );
            })}
        </Accordion>
    );
};

export default ProgramsFilterSidebar;