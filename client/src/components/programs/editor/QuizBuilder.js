import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../../ui/button.tsx';
import { Input } from '../../ui/input.tsx';
import { Label } from '../../ui/label.tsx';
import { Textarea } from '../../ui/textarea.tsx';
import { Checkbox } from '../../ui/checkbox.tsx';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group.jsx';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../ui/accordion.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx';
import { Plus, Trash2, Lightbulb } from 'lucide-react';
import { cn } from '../../../lib/utils';

const QuizBuilder = ({ lesson, setLesson }) => {
    const { t } = useTranslation(['programs']);
    const quiz = lesson.content?.quiz || { passingScore: 80, questions: [] };
    
    const [openQuestionId, setOpenQuestionId] = useState(quiz.questions[0]?._id || null);

    const setQuiz = (newQuiz) => {
        setLesson(prev => ({ ...prev, content: { ...prev.content, quiz: newQuiz }}));
    };

    const handlePassingScoreChange = (value) => {
        const score = parseInt(value, 10);
        if (!isNaN(score) && score >= 0 && score <= 100) {
            setQuiz({ ...quiz, passingScore: score });
        } else if (value === '') {
            setQuiz({ ...quiz, passingScore: '' });
        }
    };
    
    const addQuestion = () => {
        const newQuestion = { _id: uuidv4(), questionText: '', questionType: 'single_choice', options: [{_id: uuidv4(), text: '', isCorrect: true}], explanation: '' };
        setQuiz({ ...quiz, questions: [...quiz.questions, newQuestion] });
        setOpenQuestionId(newQuestion._id);
    };

    const updateQuestion = (qIndex, field, value) => {
        const updatedQuestions = quiz.questions.map((q, i) => i === qIndex ? { ...q, [field]: value } : q);
        setQuiz({ ...quiz, questions: updatedQuestions });
    };

    const deleteQuestion = (qIndex) => {
        const updatedQuestions = quiz.questions.filter((_, i) => i !== qIndex);
        setQuiz({ ...quiz, questions: updatedQuestions });
    };

    const addOption = (qIndex) => {
        const newOption = { _id: uuidv4(), text: '', isCorrect: false };
        const updatedQuestions = quiz.questions.map((q, i) => i === qIndex ? { ...q, options: [...q.options, newOption] } : q);
        setQuiz({ ...quiz, questions: updatedQuestions });
    };

    const updateOption = (qIndex, oIndex, field, value) => {
        const updatedQuestions = quiz.questions.map((q, i) => {
            if (i !== qIndex) return q;
            const updatedOptions = q.options.map((opt, j) => {
                if (j !== oIndex) {
                    if (q.questionType === 'single_choice' && field === 'isCorrect' && value) {
                        return { ...opt, isCorrect: false };
                    }
                    return opt;
                }
                return { ...opt, [field]: value };
            });
            return { ...q, options: updatedOptions };
        });
        setQuiz({ ...quiz, questions: updatedQuestions });
    };
    
    const deleteOption = (qIndex, oIndex) => {
        const updatedQuestions = quiz.questions.map((q, i) => {
            if (i !== qIndex) return q;
            if (q.options.length <= 1) return q;
            const updatedOptions = q.options.filter((_, j) => j !== oIndex);
            return { ...q, options: updatedOptions };
        });
        setQuiz({ ...quiz, questions: updatedQuestions });
    };

   return (
        <div className="flex flex-col gap-6">
            <div className="space-y-2">
                <Label htmlFor="passingScore">{t('quiz_passing_score')}</Label>
                <Input id="passingScore" type="number" min="0" max="100" value={quiz.passingScore} onChange={(e) => handlePassingScoreChange(e.target.value)} placeholder={t('passing_score_placeholder', 'e.g. 80')} />
            </div>
            
            <div className="space-y-4">
                <Label>{t('quiz_questions')}</Label>
                {quiz.questions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center space-y-4 rounded-lg border-2 border-dashed bg-muted p-8 text-center">
                        <Lightbulb className="h-12 w-12 text-muted-foreground" />
                        <h3 className="text-lg font-semibold">{t('quiz_empty_title')}</h3>
                        <p className="max-w-xs text-sm text-muted-foreground">{t('quiz_empty_desc')}</p>
                        <Button onClick={addQuestion}>
                            <Plus className="mr-2 h-4 w-4" />
                            {t('add_first_question')}
                        </Button>
                    </div>
                ) : (
                    <Accordion type="single" collapsible className="w-full space-y-3" value={openQuestionId} onValueChange={setOpenQuestionId}>
                        {quiz.questions.map((q, qIndex) => (
                            <AccordionItem value={q._id} key={q._id} className="overflow-hidden rounded-lg border bg-background">
                                <AccordionTrigger className="px-4 py-3 text-left font-semibold hover:bg-muted/50 hover:no-underline">
                                    <span className="truncate">{t('question_label', { num: qIndex + 1 })}: {q.questionText || t('new_question_placeholder')}</span>
                                </AccordionTrigger>
                                <AccordionContent className="space-y-6 border-t bg-muted/30 p-4">
                                    <Textarea placeholder={t('question_text_placeholder')} value={q.questionText} onChange={(e) => updateQuestion(qIndex, 'questionText', e.target.value)} />
                                    <Select value={q.questionType} onValueChange={(value) => updateQuestion(qIndex, 'questionType', value)}>
                                        <SelectTrigger><SelectValue placeholder={t('select_question_type_placeholder')} /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="single_choice">{t('question_type_single')}</SelectItem>
                                            <SelectItem value="multiple_choice">{t('question_type_multiple')}</SelectItem>
                                        </SelectContent>
                                    </Select>

                                   <div className="space-y-3">
                                        <div>
                                            <Label>{t('options_label')}</Label>
                                            <p className="text-sm text-muted-foreground">{t('options_hint')}</p>
                                        </div>
                                        {q.questionType === 'single_choice' ? (
                                            <RadioGroup value={q.options.find(o => o.isCorrect)?._id || ''} onValueChange={(optId) => updateOption(qIndex, q.options.findIndex(o => o._id === optId), 'isCorrect', true)} className="space-y-2">
                                             {q.options.map((opt, oIndex) => (
                                                 <div key={opt._id} className={cn("group flex items-center gap-3 rounded-md p-2 transition-colors border border-transparent", opt.isCorrect ? 'bg-primary/10' : 'hover:bg-muted')}>
                                                     <RadioGroupItem value={opt._id} id={`q${qIndex}-opt${oIndex}`} />
                                                     <Input className="flex-1 bg-background" placeholder={t('option_placeholder', { num: oIndex + 1})} value={opt.text} onChange={(e) => updateOption(qIndex, oIndex, 'text', e.target.value)} />
                                                     <Button variant="ghost" size="icon" onClick={() => deleteOption(qIndex, oIndex)} disabled={q.options.length <= 1} className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                                    </div>
                                                ))}
                                            </RadioGroup>
                                        ) : (
                                            <div className="space-y-2">
                                                {q.options.map((opt, oIndex) => (
                                                   <div key={opt._id} className={cn("group flex items-center gap-3 rounded-md p-2 transition-colors border border-transparent", opt.isCorrect ? 'bg-primary/10' : 'hover:bg-muted')}>
                                                        <Checkbox checked={opt.isCorrect} onCheckedChange={(checked) => updateOption(qIndex, oIndex, 'isCorrect', !!checked)} id={`q${qIndex}-opt${oIndex}`} />
                                                        <Input className="flex-1 bg-background" placeholder={t('option_placeholder', { num: oIndex + 1})} value={opt.text} onChange={(e) => updateOption(qIndex, oIndex, 'text', e.target.value)} />
                                                        <Button variant="ghost" size="icon" onClick={() => deleteOption(qIndex, oIndex)} disabled={q.options.length <= 1} className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <Button variant="outline" size="sm" onClick={() => addOption(qIndex)} className="self-start"><Plus className="mr-2 h-4 w-4" />{t('add_option')}</Button>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2 font-medium">
                                            <Lightbulb className="h-4 w-4" />
                                            <span>{t('explanation_label')}</span>
                                        </Label>
                                        <Textarea placeholder={t('explanation_placeholder')} value={q.explanation || ''} onChange={(e) => updateQuestion(qIndex, 'explanation', e.target.value)} />
                                    </div>
                                    <Button variant="ghost" className="self-start text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => deleteQuestion(qIndex)}><Trash2 className="mr-2 h-4 w-4"/>{t('delete_question')}</Button>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                )}
            </div>

            {quiz.questions.length > 0 && (
                 <Button variant="outline" onClick={addQuestion} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />{t('add_another_question')}
                </Button>
            )}
        </div>
    );
};

export default QuizBuilder;