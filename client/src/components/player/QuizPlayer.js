import React, { useState, useEffect, useCallback } from 'react';
import { useProgramPlayer } from '../../contexts/ProgramPlayerContext';
import { Lightbulb, AlertCircle, CheckCircle, XCircle, ArrowRight, RotateCw, Check, X, FileQuestion, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Progress } from '../ui/progress.jsx';
import { ScrollArea } from '../ui/scroll-area.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';
import { cn } from '../../lib/utils';
import { logger } from '../../utils/logger'; // Assuming you have a logger utility

/**
 * A robust helper to get a string representation of a MongoDB-style ID.
 * This is crucial for comparisons, state keys, and React keys.
 * @param {string | { $oid: string } | object} id The ID to process.
 * @returns {string} The string representation of the ID.
 */
const getSafeId = (id) => {
    if (typeof id === 'string') return id;
    if (id && typeof id === 'object' && id.$oid) return id.$oid;
    // Fallback for any other type. String() is safer than JSON.stringify for objects.
    return String(id); 
};

/**
 * A sub-component to display the summary of the quiz results.
 */
const QuizResultsSummary = ({ results, totalQuestions, t }) => (
    <Card className="shadow-md rounded-xl border border-border animate-in fade-in-50 duration-500" style={{animationDelay: '100ms'}}>
        <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold text-center">{t('quiz_result_summary', 'Result Summary')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center px-4 pb-4">
            <div className="flex flex-col items-center justify-center p-3 bg-muted/50 dark:bg-muted/70 rounded-lg">
                <p className="text-xs font-medium text-muted-foreground">{t('score', 'Score')}</p>
                <p className="text-lg font-bold text-foreground">{results.score.toFixed(0)}%</p>
            </div>
            <div className="flex flex-col items-center justify-center p-3 bg-muted/50 dark:bg-muted/70 rounded-lg">
                <p className="text-xs font-medium text-muted-foreground">{t('correct', 'Correct')}</p>
                <p className="text-lg font-bold text-green-600 dark:text-green-500">{results.correctCount} / {totalQuestions}</p>
            </div>
            <div className="flex flex-col items-center justify-center p-3 bg-muted/50 dark:bg-muted/70 rounded-lg">
                <p className="text-xs font-medium text-muted-foreground">{t('incorrect', 'Incorrect')}</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-500">{results.incorrectCount} / {totalQuestions}</p>
            </div>
            <div className="flex flex-col items-center justify-center p-3 bg-muted/50 dark:bg-muted/70 rounded-lg">
                <p className="text-xs font-medium text-muted-foreground">{t('status', 'Status')}</p>
                {results.passed ? (
                    <div className="flex items-center gap-1.5">
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-500" />
                        <p className="text-sm font-semibold text-green-600 dark:text-green-500">{t('passed', 'Passed')}</p>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5">
                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-500" />
                        <p className="text-sm font-semibold text-red-600 dark:text-red-500">{t('failed', 'Failed')}</p>
                    </div>
                )}
            </div>
        </CardContent>
    </Card>
);

const QuizPlayer = () => {
    const { currentLesson, completeCurrentLesson } = useProgramPlayer();
    const { t } = useTranslation(['programs', 'common']);
    const quiz = currentLesson?.content?.quiz;

    const [quizState, setQuizState] = useState('not_started');
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [results, setResults] = useState(null);

    const totalQuestions = quiz?.questions.length || 0;
    const currentQuestion = quiz?.questions[currentQuestionIndex];
    
    const initializeAnswers = useCallback(() => {
        if (!quiz?.questions) return;
        const initialAnswers = {};
        quiz.questions.forEach(q => {
            const qId = getSafeId(q._id);
            if (q.questionType === 'multiple_choice') {
                initialAnswers[qId] = [];
            } else {
                initialAnswers[qId] = null;
            }
        });
        setAnswers(initialAnswers);
        logger.debug('[QuizPlayer] Answers initialized:', initialAnswers);
    }, [quiz]);

    useEffect(() => {
        if (quizState === 'in_progress') {
            initializeAnswers();
        }
    }, [quizState, initializeAnswers]);
    
    const handleSubmit = useCallback((finalAnswers = answers) => {
        let score = 0;
        const detailedResults = quiz.questions.map(q => {
            const qId = getSafeId(q._id);
            const userAnswers = finalAnswers[qId];
            const correctOptions = q.options.filter(opt => opt.isCorrect).map(opt => getSafeId(opt._id));
            let isCorrect = false;

            if (q.questionType === 'single_choice') {
                isCorrect = userAnswers === correctOptions[0];
            } else {
                isCorrect = Array.isArray(userAnswers) && Array.isArray(correctOptions) &&
                            userAnswers.length === correctOptions.length && 
                            correctOptions.every(id => userAnswers.includes(id));
            }

            if (isCorrect) score++;
            return { ...q, userAnswer: userAnswers, isCorrect };
        });

        const finalScore = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;
        const passed = finalScore >= (quiz.passingScore || 80);
        
        setResults({ 
            score: finalScore, 
            passed, 
            details: detailedResults,
            correctCount: score,
            incorrectCount: totalQuestions - score
        });
        setQuizState('results');

        if (passed) {
            completeCurrentLesson();
        }
    }, [answers, quiz, totalQuestions, completeCurrentLesson]);

    const handleAnswerChange = (questionId, optionId, questionType, checked = null) => {
        setAnswers(prev => {
            let newAnswersForQuestion;
            if (questionType === 'single_choice') {
                newAnswersForQuestion = optionId;
            } else { // multiple_choice
                const existingAnswers = prev[questionId] || [];
                const isChecked = checked !== null ? checked : !existingAnswers.includes(optionId);
                newAnswersForQuestion = isChecked
                    ? [...existingAnswers, optionId]
                    : existingAnswers.filter(id => id !== optionId);
            }
            return { ...prev, [questionId]: newAnswersForQuestion };
        });
    };

    const handleRetake = () => {
        setQuizState('in_progress');
        setCurrentQuestionIndex(0);
        setResults(null);
    };

    const isQuestionAnswered = (questionId, questionType) => {
        const userAnswer = answers[questionId];
        if (questionType === 'single_choice') {
            return !!userAnswer;
        } else {
            return Array.isArray(userAnswer) && userAnswer.length > 0;
        }
    };

    useEffect(() => {
        logger.debug('[QuizPlayer] Answers state has been updated to:', answers);
    }, [answers]);

    if (!quiz || !quiz.questions || totalQuestions === 0) {
        return (
            <div className="flex items-center justify-center h-full text-destructive bg-background p-4">
                <AlertCircle className="h-5 w-5 mr-2" />
                <p className="text-sm font-medium">{t('quizDataMissing', 'Quiz data is missing or invalid.')}</p>
            </div>
        );
    }
    
    if (quizState === 'not_started') {
        return (
            <div className="h-full w-full flex items-center justify-center p-4 sm:p-6 bg-muted/30">
                <Card className="w-full max-w-lg text-center shadow-xl rounded-xl border border-border animate-in zoom-in-95 fade-in-50 duration-300">
                    <CardHeader className="p-6 sm:p-8">
                        <div className="mx-auto bg-primary/10 text-primary rounded-full p-4 w-16 h-16 flex items-center justify-center mb-4 shadow-sm">
                            <FileQuestion size={32} />
                        </div>
                        <CardTitle className="text-2xl font-bold">{t('quiz')}: {currentLesson.title}</CardTitle>
                        <CardDescription className="text-base mt-2 text-muted-foreground">
                            {t('quiz_summary_count', { count: totalQuestions, score: quiz.passingScore || 80 })}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-6 pb-6 sm:px-8 sm:pb-8">
                        <Button size="lg" className="w-full text-base font-semibold rounded-lg shadow-sm hover:shadow-md transition-shadow" onClick={() => setQuizState('in_progress')}>
                            {t('start_quiz', 'Start Quiz')} <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (quizState === 'in_progress' && currentQuestion) {
        const questionId = getSafeId(currentQuestion._id);
        const isAnswered = isQuestionAnswered(questionId, currentQuestion.questionType);

        return (
            <TooltipProvider>
            <div className="h-full w-full flex items-center justify-center p-4 sm:p-6 bg-muted/20">
                <Card key={questionId} className="w-full max-w-2xl shadow-xl rounded-xl border border-border animate-in fade-in-50 slide-in-from-right-10 duration-300">
                    <CardHeader className="pb-4 pt-6 px-6">
                        <Progress value={((currentQuestionIndex + 1) / totalQuestions) * 100} className="w-full h-2 rounded-full mb-4" />
                        <CardDescription className="text-center text-sm font-medium text-muted-foreground">{t('question_label', { num: currentQuestionIndex + 1, total: totalQuestions })}</CardDescription>
                        <CardTitle className="text-xl md:text-2xl text-center pt-2 font-semibold leading-tight">{currentQuestion.questionText}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-6 pb-6">
                        <div className="space-y-3 my-6">
                            {currentQuestion.questionType === 'single_choice' ? (
                                <div className="space-y-3">
                                    {currentQuestion.options.map(opt => {
                                        const optionId = getSafeId(opt._id);
                                        const isSelected = answers[questionId] === optionId;
                                        return (
                                            <div
                                                key={optionId}
                                                onClick={() => handleAnswerChange(questionId, optionId, 'single_choice')}
                                                className={cn(
                                                    "flex items-center p-4 border rounded-lg cursor-pointer hover:bg-muted/80 transition-all duration-200 text-left",
                                                    isSelected ? "bg-blue-100 dark:bg-blue-900/50 border-blue-400 dark:border-blue-700 shadow-sm" : "bg-card/50 border-border"
                                                )}
                                            >
                                                <div className={cn("w-5 h-5 mr-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center", isSelected ? "border-blue-500 dark:border-blue-400 bg-blue-500 dark:bg-blue-400" : "border-muted-foreground/50")}>
                                                    {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                                                </div>
                                                <span className={cn("flex-1 text-base font-medium", isSelected && "text-blue-800 dark:text-blue-200")}>
                                                    {opt.text}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {currentQuestion.options.map(opt => {
                                        const optionId = getSafeId(opt._id);
                                        const isSelected = (answers[questionId] || []).includes(optionId);
                                        return (
                                            <div
                                                key={optionId}
                                                onClick={() => handleAnswerChange(questionId, optionId, 'multiple_choice', !isSelected)}
                                                className={cn(
                                                    "flex items-center p-4 border rounded-lg cursor-pointer hover:bg-muted/80 transition-all duration-200 text-left",
                                                     isSelected ? "bg-blue-100 dark:bg-blue-900/50 border-blue-400 dark:border-blue-700 shadow-sm" : "bg-card/50 border-border"
                                                )}
                                            >
                                                <div className={cn("w-5 h-5 mr-4 flex-shrink-0 rounded-md border-2 flex items-center justify-center", isSelected ? "bg-blue-500 dark:bg-blue-400 border-blue-500 dark:border-blue-400" : "border-muted-foreground/50")}>
                                                    {isSelected && <Check className="h-4 w-4 text-white" />}
                                                </div>
                                                <span className={cn("flex-1 text-base font-medium", isSelected && "text-blue-800 dark:text-blue-200")}>
                                                    {opt.text}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="mt-8 flex justify-between items-center gap-3">
                            <Tooltip><TooltipTrigger asChild>
                                <Button variant="outline" size="lg" onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))} disabled={currentQuestionIndex === 0} className="rounded-lg">
                                    <ChevronLeft className="h-5 w-5" />
                                    <span className="ml-2 hidden sm:inline">{t('common:previous')}</span>
                                </Button>
                            </TooltipTrigger><TooltipContent><p>{t('common:previous')}</p></TooltipContent></Tooltip>
                            
                            {currentQuestionIndex < totalQuestions - 1 ? (
                                <Tooltip><TooltipTrigger asChild>
                                <Button size="lg" onClick={() => setCurrentQuestionIndex(prev => prev + 1)} disabled={!isAnswered} className="rounded-lg">
                                    <span className="hidden sm:inline">{t('common:next')}</span>
                                    <ArrowRight className="h-5 w-5 sm:ml-2" />
                                </Button>
                                </TooltipTrigger><TooltipContent><p>{t('common:next')}</p></TooltipContent></Tooltip>
                            ) : (
                                <Tooltip><TooltipTrigger asChild>
                                <Button size="lg" onClick={() => handleSubmit(answers)} disabled={!isAnswered} className="rounded-lg bg-green-600 hover:bg-green-700 text-white">
                                    <span className="hidden sm:inline">{t('common:submit')}</span>
                                    <Check className="h-5 w-5 sm:ml-2" />
                                </Button>
                                </TooltipTrigger><TooltipContent><p>{t('common:submit')}</p></TooltipContent></Tooltip>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
            </TooltipProvider>
        );
    }
    
    if (quizState === 'results') {
        return (
            <ScrollArea className="h-full w-full bg-background">
              <div className="max-w-3xl mx-auto space-y-6 px-4 sm:px-6 lg:px-8 py-8">
                    <Card className={cn(
                        "text-center shadow-xl rounded-xl border-2 animate-in zoom-in-95 fade-in-50 duration-300",
                        results.passed ? "border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950/50" : "border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-950/50"
                    )}>
                        <CardHeader className="items-center p-6 sm:p-8">
                             {results.passed 
                                ? <CheckCircle className="h-16 w-16 text-green-500 mb-3" /> 
                                : <XCircle className="h-16 w-16 text-red-500 mb-3" />
                             }
                            <CardTitle className="text-3xl font-bold">
                                {results.passed ? t('quiz_passed_title', 'Quiz Passed!') : t('quiz_failed_title', 'Try Again')}
                            </CardTitle>
                            <CardDescription className={cn("text-base mt-2", results.passed ? "text-muted-foreground" : "text-red-600 dark:text-red-400")}>
                                {results.passed ? t('quiz_passed_desc', 'Great job! You can now proceed.') : t('quiz_failed_desc', { score: quiz.passingScore || 80 })}
                            </CardDescription>
                        </CardHeader>
                        {!results.passed && (
                             <CardContent className="pb-6 px-6 sm:pb-8 sm:px-8">
                                <Button onClick={handleRetake} size="lg" className="w-full max-w-xs mx-auto text-base font-semibold rounded-lg shadow-sm hover:shadow-md transition-shadow">
                                    <RotateCw className="mr-2 h-4 w-4"/> {t('retake_quiz', 'Retake Quiz')}
                                </Button>
                            </CardContent>
                        )}
                    </Card>

                    <QuizResultsSummary results={results} totalQuestions={totalQuestions} t={t} />

                    <div className="pt-6 text-center animate-in fade-in-50" style={{animationDelay: '200ms'}}>
                        <h3 className="text-2xl font-bold text-foreground">{t('detailed_review', 'Detailed Review')}</h3>
                        <p className="text-base text-muted-foreground mt-2">{t('review_your_answers_desc', 'Review your answers for each question below.')}</p>
                    </div>

                    <div className="space-y-5">
                        {results.details.map((res, index) => {
                            const resId = getSafeId(res._id);
                            return (
                                <Card key={resId} className="shadow-md rounded-xl border border-border animate-in fade-in-50 slide-in-from-bottom-2" style={{animationDelay: `${300 + index * 100}ms`}}>
                                    <CardHeader className="p-4 flex-row justify-between items-start gap-4">
                                        <p className="font-semibold text-base leading-tight pr-4">{index + 1}. {res.questionText}</p>
                                        {res.isCorrect 
                                            ? <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" /> 
                                            : <XCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
                                        }
                                    </CardHeader>
                                    <CardContent className="px-4 pb-4">
                                        <div className="space-y-2">
                                            {res.options.map(opt => {
                                                const optionId = getSafeId(opt._id);
                                                const isUserSelected = Array.isArray(res.userAnswer) ? res.userAnswer.includes(optionId) : res.userAnswer === optionId;
                                                const isCorrectChoice = opt.isCorrect;

                                                return (
                                                    <div key={optionId} className={cn(
                                                        "p-3 border rounded-lg flex items-start text-sm font-medium text-left",
                                                        isCorrectChoice && "bg-green-100/70 dark:bg-green-900/30 border-green-300 dark:border-green-700/50 text-green-800 dark:text-green-200",
                                                        !isCorrectChoice && isUserSelected && "bg-red-100/70 dark:bg-red-900/30 border-red-300 dark:border-red-700/50 text-red-800 dark:text-red-200",
                                                        !isCorrectChoice && !isUserSelected && "bg-card/50 border-border",
                                                    )}>
                                                        {isCorrectChoice 
                                                            ? <Check className="h-5 w-5 mr-3 mt-0.5 text-green-600 dark:text-green-500 flex-shrink-0"/>
                                                            : isUserSelected 
                                                              ? <X className="h-5 w-5 mr-3 mt-0.5 text-red-600 dark:text-red-500 flex-shrink-0"/> 
                                                              : <div className="h-5 w-5 mr-3 flex-shrink-0"/>
                                                        }
                                                        <span className="flex-1">{opt.text}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {res.explanation && (
                                            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800/80 rounded-lg flex items-start shadow-sm">
                                                <Lightbulb className="h-5 w-5 mr-3 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5"/>
                                                <div>
                                                    <p className="font-semibold text-blue-800 dark:text-blue-300 text-sm">{t('explanation_label', 'Explanation')}</p>
                                                    <p className="text-sm text-blue-700 dark:text-blue-400 mt-1 leading-relaxed">{res.explanation}</p>
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </ScrollArea>
        );
    }
    
    return null; // Fallback for any undefined state
};

export default QuizPlayer;