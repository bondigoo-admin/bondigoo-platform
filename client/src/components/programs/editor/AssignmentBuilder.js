import React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '../../ui/label.tsx';
import { Textarea } from '../../ui/textarea.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx';

const AssignmentBuilder = ({ lesson, setLesson }) => {
    const { t } = useTranslation(['programs']);

    const handleValueChange = (field, value) => {
        setLesson(prevLesson => {
            const currentAssignment = prevLesson.content?.assignment || { instructions: '', submissionType: 'text' };
            const updatedAssignment = { ...currentAssignment, [field]: value };
            return {
                ...prevLesson,
                content: {
                    ...prevLesson.content,
                    assignment: updatedAssignment
                }
            };
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <Label htmlFor="instructions">{t('assignment_instructions_label')}</Label>
                <Textarea
                    id="instructions"
                    rows={8}
                    className="mt-2"
                    value={lesson.content?.assignment?.instructions || ''}
                    onChange={(e) => handleValueChange('instructions', e.target.value)}
                    placeholder={t('assignment_instructions_placeholder')}
                />
            </div>
            <div>
                <Label htmlFor="submissionType">{t('submission_type')}</Label>
                <Select
                    value={lesson.content?.assignment?.submissionType || 'text'}
                    onValueChange={(value) => handleValueChange('submissionType', value)}
                >
                    <SelectTrigger id="submissionType" className="mt-2">
                        <SelectValue placeholder={t('select_submission_type_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="text">{t('submission_type_text')}</SelectItem>
                        <SelectItem value="file_upload">{t('submission_type_file_upload')}</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
};

export default AssignmentBuilder;