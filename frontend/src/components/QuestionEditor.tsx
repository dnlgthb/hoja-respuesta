'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Question, QuestionType } from '@/types';
import { Trash2, ChevronUp, ChevronDown, GripVertical, Pencil, Check } from 'lucide-react';
import MathField from '@/components/MathField';
import MathToolbar from '@/components/MathToolbar';
import RichMathText from '@/components/RichMathText';
import { testsAPI } from '@/lib/api';
import QuestionTipTapEditor from '@/components/tiptap/QuestionTipTapEditor';
import { extractFirstImageUrl, normalizeForTipTap, normalizeForComparison } from '@/components/tiptap/serializers';

/** Merge context + question text into a single string, normalized for TipTap round-trip */
function mergeContextAndText(context: string | null, text: string): string {
  const merged = context ? context + '\n\n' + text : text;
  return normalizeForTipTap(merged);
}

/** Clean display text: fix literal \n, \textdollar from DB */
function cleanDisplayText(text: string): string {
  if (!text) return text;
  // Fix literal \n (backslash+n) → actual newlines
  text = text.replace(/\\n(?![a-zA-Z])/g, '\n');
  // Fix \text{\textdollar} → $
  text = text.replace(/\\text\{\\textdollar\}/g, '\\$');
  text = text.replace(/\\textdollar/g, '\\$');
  return text;
}

/** Truncate text without breaking $...$ LaTeX delimiters */
function truncateLatexAware(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  // Find last safe cut point: outside a $...$ block
  let inMath = false;
  let lastSafeCut = 0;
  for (let i = 0; i < Math.min(text.length, maxLen); i++) {
    if (text[i] === '$') {
      if (!inMath) {
        // Opening $: safe to cut here (before the math)
        lastSafeCut = i;
        inMath = true;
      } else {
        // Closing $: safe to cut after
        inMath = false;
        lastSafeCut = i + 1;
      }
    } else if (!inMath) {
      lastSafeCut = i + 1;
    }
  }
  // If we're inside math at maxLen, cut before the opening $
  const cutAt = inMath ? lastSafeCut : maxLen;
  if (cutAt === 0) return text.substring(0, maxLen) + '...';
  return text.substring(0, cutAt).trimEnd() + (cutAt < text.length ? '...' : '');
}

interface QuestionEditorProps {
  question: Question;
  index: number;
  totalQuestions: number;
  testId?: string;
  onChange: (updatedQuestion: Partial<Question>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  requireFalseJustification?: boolean;
  isFirst: boolean;
  isLast: boolean;
  isManualMode?: boolean;
}

export default function QuestionEditor({
  question,
  index,
  totalQuestions,
  testId,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  requireFalseJustification = false,
  isFirst,
  isLast,
  isManualMode = false,
}: QuestionEditorProps) {
  // Usar snake_case del backend como fallback
  const questionLabel = question.questionLabel || question.question_label || String(index + 1);
  const questionText = cleanDisplayText(question.questionText || question.question_text || '');
  const questionType = question.questionType || question.type || QuestionType.DEVELOPMENT;
  const correctAnswer = question.correctAnswer || question.correct_answer || '';
  const correctionCriteria = question.correctionCriteria || question.correction_criteria || '';
  const requireUnits = question.requireUnits ?? question.require_units ?? false;
  const unitPenalty = question.unitPenalty ?? question.unit_penalty ?? 0.5;
  // In answer-sheet mode (no question text), context holds the section name — don't merge it into text
  const questionContext = questionText ? (cleanDisplayText(question.context || '') || null) : null;
  const imageUrl = question.imageUrl || question.image_url || null;
  const hasImage = question.hasImage || question.has_image || false;
  const imageDescription = question.imageDescription || question.image_description || null;

  const [localLabel, setLocalLabel] = useState(questionLabel);
  const [localText, setLocalText] = useState(() => mergeContextAndText(questionContext, questionText));
  const [localType, setLocalType] = useState<QuestionType>(questionType);
  const [localCorrectAnswer, setLocalCorrectAnswer] = useState(correctAnswer);
  const [localCriteria, setLocalCriteria] = useState(correctionCriteria);
  const [localOptions, setLocalOptions] = useState<string[]>(question.options || []);
  const [localPoints, setLocalPoints] = useState(question.points || 1);
  const [localImageUrl, setLocalImageUrl] = useState(imageUrl || '');
  const [localRequireUnits, setLocalRequireUnits] = useState(requireUnits);
  const [localUnitPenalty, setLocalUnitPenalty] = useState(String(unitPenalty * 100));
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditingText, setIsEditingText] = useState(isManualMode && !localText);
  const [isEditingOptions, setIsEditingOptions] = useState(false);
  const [optionMathMode, setOptionMathMode] = useState<boolean[]>(
    () => (question.options || []).map(opt => /\$/.test(opt))
  );
  const optionInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Insertar LaTeX en un input de opción
  const handleInsertLatexOption = (optionIndex: number, latex: string) => {
    const input = optionInputRefs.current[optionIndex];
    if (!input) return;

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;

    const cleanLatex = latex.replace(/#0/g, '');
    const wrapped = cleanLatex.startsWith('$') ? cleanLatex : `$${cleanLatex}$`;

    const currentValue = localOptions[optionIndex] || '';
    const before = currentValue.slice(0, start);
    const after = currentValue.slice(end);
    const newValue = before + wrapped + after;

    handleOptionChange(optionIndex, newValue);

    requestAnimationFrame(() => {
      input.focus();
      const cursorPos = start + wrapped.length;
      input.setSelectionRange(cursorPos, cursorPos);
    });
  };

  // Strip $ delimiters and A) prefix for MathField (options)
  const getOptionLatex = (option: string): string => {
    let cleaned = option.replace(/^[A-Z]\)\s*/, '').trim();
    if (cleaned.startsWith('$$') && cleaned.endsWith('$$')) return cleaned.slice(2, -2);
    if (cleaned.startsWith('$') && cleaned.endsWith('$')) return cleaned.slice(1, -1);
    return cleaned;
  };

  // Wrap LaTeX from MathField back in $ delimiters
  const handleOptionMathChange = (optionIndex: number, latex: string) => {
    const value = latex.trim() ? `$${latex}$` : '';
    handleOptionChange(optionIndex, value);
  };

  const toggleOptionMathMode = (optionIndex: number) => {
    setOptionMathMode(prev => {
      const next = [...prev];
      next[optionIndex] = !next[optionIndex];
      return next;
    });
  };

  useEffect(() => {
    setLocalLabel(questionLabel);
    setLocalText(mergeContextAndText(questionContext, questionText));
    setLocalType(questionType);
    setLocalCorrectAnswer(correctAnswer);
    setLocalCriteria(correctionCriteria);
    setLocalOptions(question.options || []);
    setLocalPoints(question.points || 1);
    setLocalRequireUnits(requireUnits);
    setLocalUnitPenalty(String(unitPenalty * 100));
    setLocalImageUrl(imageUrl || '');
  }, [questionLabel, questionContext, questionText, questionType, correctAnswer, correctionCriteria, question.options, question.points, requireUnits, unitPenalty, imageUrl]);

  // Reset edit states when collapsing
  useEffect(() => {
    if (!isExpanded) {
      setIsEditingText(false);
      setIsEditingOptions(false);
    }
  }, [isExpanded]);

  const handleLabelChange = (value: string) => {
    setLocalLabel(value);
    onChange({ question_label: value });
  };

  // Ref to track what was passed to TipTap (updated after tipTapContent is computed below)
  const tipTapContentRef = useRef('');

  // Unified change handler for TipTap editor: saves question_text + extracts image_url + clears context
  const handleUnifiedChange = useCallback((text: string) => {
    // Skip if normalized text hasn't changed (prevents phantom changes on editor init)
    const nt = normalizeForComparison(text);
    if (nt === normalizeForComparison(localText) || nt === normalizeForComparison(tipTapContentRef.current)) return;
    setLocalText(text);
    const imgUrl = extractFirstImageUrl(text);
    onChange({
      question_text: text,
      context: null,
      image_url: imgUrl,
      has_image: !!imgUrl,
    });
    setLocalImageUrl(imgUrl || '');
  }, [localText, onChange]);

  const handleTypeChange = (value: QuestionType) => {
    setLocalType(value);
    onChange({ type: value });
    // Limpiar opciones si cambia de MULTIPLE_CHOICE a otro tipo
    if (value !== QuestionType.MULTIPLE_CHOICE) {
      setLocalOptions([]);
      onChange({ options: [] });
    } else if (localOptions.length === 0) {
      // Agregar opciones por defecto para MULTIPLE_CHOICE
      const defaultOptions = ['', '', '', ''];
      setLocalOptions(defaultOptions);
      onChange({ options: defaultOptions });
    }
  };

  const handleCorrectAnswerChange = (value: string) => {
    setLocalCorrectAnswer(value);
    onChange({ correct_answer: value });
  };

  const handleCriteriaChange = (value: string) => {
    const normalized = value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    setLocalCriteria(normalized);
    onChange({ correction_criteria: normalized });
  };

  const handlePointsChange = (value: number) => {
    setLocalPoints(value);
    onChange({ points: value });
  };

  const handleOptionChange = (optionIndex: number, value: string) => {
    const newOptions = [...localOptions];
    newOptions[optionIndex] = value;
    setLocalOptions(newOptions);
    onChange({ options: newOptions });
  };

  const addOption = () => {
    const newOptions = [...localOptions, ''];
    setLocalOptions(newOptions);
    setOptionMathMode(prev => [...prev, false]);
    onChange({ options: newOptions });
  };

  const removeOption = (optionIndex: number) => {
    const newOptions = localOptions.filter((_, i) => i !== optionIndex);
    setLocalOptions(newOptions);
    setOptionMathMode(prev => prev.filter((_, i) => i !== optionIndex));
    onChange({ options: newOptions });
  };

  const handleRequireUnitsChange = (value: boolean) => {
    setLocalRequireUnits(value);
    onChange({ require_units: value });
  };

  const handleUnitPenaltyChange = (value: string) => {
    setLocalUnitPenalty(value);
    const numValue = parseFloat(value) / 100;
    if (!isNaN(numValue)) {
      onChange({ unit_penalty: numValue });
    }
  };

  // Prepare content for TipTap: inject standalone image_url into text if not already inline
  const tipTapContent = useMemo(() => {
    if (localImageUrl && !localText.includes(localImageUrl)) {
      return normalizeForTipTap(`![${imageDescription || ''}](${localImageUrl})\n\n${localText}`);
    }
    return localText;
  }, [localText, localImageUrl, imageDescription]);
  tipTapContentRef.current = tipTapContent;

  const typeLabels: Record<QuestionType, string> = {
    [QuestionType.TRUE_FALSE]: 'Verdadero/Falso',
    [QuestionType.MULTIPLE_CHOICE]: 'Alternativas',
    [QuestionType.DEVELOPMENT]: 'Desarrollo',
    [QuestionType.MATH]: 'Matemática',
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      {/* Header colapsable */}
      <div
        className="flex items-center gap-3 p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <GripVertical className="w-5 h-5 text-gray-400" />

        <div className="flex-1 flex items-center gap-3">
          <span className="font-semibold text-gray-900">
            {localLabel}
          </span>
          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
            {typeLabels[localType]}
          </span>
          <span className="text-sm text-gray-500 truncate max-w-xs">
            {localText ? (
              <RichMathText text={truncateLatexAware(localText, 80)} />
            ) : (
              <span className="italic text-gray-400">{isManualMode ? 'Sin enunciado' : 'Hoja de respuesta'}</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Botones de reordenar */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            disabled={isFirst}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            title="Mover arriba"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            disabled={isLast}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            title="Mover abajo"
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          {/* Botón eliminar */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded ml-2"
            title="Eliminar pregunta"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contenido expandible */}
      {isExpanded && (
        <div className="p-6 space-y-4 border-t border-gray-200">
          {/* Fila: Nomenclatura, Tipo, Puntaje */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nomenclatura
              </label>
              <input
                type="text"
                value={localLabel}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder="Ej: I.a, 1.1, II"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de pregunta
              </label>
              <select
                value={localType}
                onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 bg-white"
              >
                <option value={QuestionType.TRUE_FALSE}>Verdadero/Falso</option>
                <option value={QuestionType.MULTIPLE_CHOICE}>Alternativas</option>
                <option value={QuestionType.DEVELOPMENT}>Desarrollo</option>
                <option value={QuestionType.MATH}>Matemática</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Puntaje
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={localPoints}
                onChange={(e) => handlePointsChange(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900"
              />
            </div>
          </div>

          {/* Enunciado: unified TipTap editor (context + images + question text) */}
          {/* Hidden in answer-sheet mode (no text) — unless manual mode where prof writes questions */}
          {(localText || isManualMode) ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-700">Enunciado</span>
                <button
                  type="button"
                  onClick={() => setIsEditingText(!isEditingText)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-primary hover:bg-primary/5 rounded transition-colors"
                  title={isEditingText ? 'Cerrar editor' : 'Editar enunciado'}
                >
                  {isEditingText ? (
                    <><Check className="w-3.5 h-3.5" /><span>Listo</span></>
                  ) : (
                    <><Pencil className="w-3.5 h-3.5" /><span>Editar</span></>
                  )}
                </button>
              </div>

              <div className="p-3">
                {isEditingText ? (
                  <QuestionTipTapEditor
                    content={tipTapContent}
                    onChange={handleUnifiedChange}
                    onImageUpload={testId ? async (file) => {
                      const result = await testsAPI.uploadQuestionImage(testId, file);
                      return result.url;
                    } : undefined}
                    placeholder="Escribe el enunciado de la pregunta..."
                  />
                ) : (
                  <div
                    className="px-3 py-2 bg-gray-50 rounded-md border border-gray-200 min-h-[2.5rem] cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setIsEditingText(true)}
                  >
                    <>
                      {/* Show standalone image for backward compat */}
                      {localImageUrl && !localText.includes('![') && (
                        <img
                          src={localImageUrl}
                          alt={imageDescription || 'Imagen de la pregunta'}
                          className="max-w-full max-h-80 object-contain rounded border border-gray-100 mb-2"
                          loading="lazy"
                        />
                      )}
                      <RichMathText text={localText} className="text-gray-900" />
                    </>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Campos específicos por tipo */}
          <div className="border-t border-gray-200 pt-4">
            {/* VERDADERO/FALSO */}
            {localType === QuestionType.TRUE_FALSE && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Respuesta Correcta:
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      value="Verdadero"
                      checked={localCorrectAnswer === 'Verdadero'}
                      onChange={(e) => handleCorrectAnswerChange(e.target.value)}
                      className="w-4 h-4 text-primary focus:ring-primary"
                    />
                    <span className="text-gray-700">Verdadero</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      value="Falso"
                      checked={localCorrectAnswer === 'Falso'}
                      onChange={(e) => handleCorrectAnswerChange(e.target.value)}
                      className="w-4 h-4 text-primary focus:ring-primary"
                    />
                    <span className="text-gray-700">Falso</span>
                  </label>
                </div>

                {requireFalseJustification && localCorrectAnswer === 'Falso' && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pauta para justificación de Falso:
                    </label>
                    <textarea
                      value={localCriteria}
                      onChange={(e) => handleCriteriaChange(e.target.value)}
                      placeholder="Describe qué debe incluir la justificación del estudiante..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900"
                    />
                  </div>
                )}
              </div>
            )}

            {/* MÚLTIPLE OPCIÓN */}
            {localType === QuestionType.MULTIPLE_CHOICE && (() => {
              // Answer-sheet mode: options are just letters (e.g. ["A","B","C","D"])
              const isAnswerSheet = localOptions.every(opt => /^[A-H]$/.test(opt.trim()));

              if (isAnswerSheet) {
                return (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Respuesta correcta:
                    </label>
                    <div className="flex gap-3 mb-3">
                      {localOptions.map((opt, idx) => {
                        const letter = opt.trim();
                        const isCorrect = localCorrectAnswer === letter;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleCorrectAnswerChange(letter)}
                            className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center text-sm font-bold ${
                              isCorrect
                                ? 'border-green-500 bg-green-500 text-white shadow-md'
                                : 'border-gray-300 bg-white text-gray-600 hover:border-green-300 hover:bg-green-50'
                            }`}
                          >
                            {letter}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Alternativas:</label>
                      <input
                        type="number"
                        min="2"
                        max="8"
                        value={localOptions.length}
                        onChange={(e) => {
                          const count = Math.max(2, Math.min(8, Number(e.target.value)));
                          const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
                          const newOptions = letters.slice(0, count);
                          setLocalOptions(newOptions);
                          onChange({ options: newOptions });
                        }}
                        className="w-14 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                      />
                    </div>
                  </div>
                );
              }

              return (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Opciones (marca la correcta):
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsEditingOptions(!isEditingOptions)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-primary hover:bg-primary/5 rounded transition-colors"
                    title={isEditingOptions ? 'Cerrar editor' : 'Editar opciones'}
                  >
                    {isEditingOptions ? (
                      <><Check className="w-3.5 h-3.5" /><span>Listo</span></>
                    ) : (
                      <><Pencil className="w-3.5 h-3.5" /><span>Editar</span></>
                    )}
                  </button>
                </div>

                {isEditingOptions ? (
                  /* === MODO EDICIÓN === */
                  <>
                    <div className="space-y-3">
                      {localOptions.map((option, optionIndex) => {
                        const letter = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][optionIndex] || String(optionIndex + 1);
                        const isMathMode = optionMathMode[optionIndex] || false;
                        return (
                          <div key={optionIndex}>
                            <div className="flex items-start gap-2">
                              <input
                                type="radio"
                                name={`question-${question.id}`}
                                checked={localCorrectAnswer === letter}
                                onChange={() => handleCorrectAnswerChange(letter)}
                                className="w-4 h-4 text-primary focus:ring-primary flex-shrink-0 mt-3"
                              />
                              <span className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600 flex-shrink-0 mt-1">
                                {letter}
                              </span>
                              <div className="flex-1">
                                {isMathMode ? (
                                  <MathField
                                    value={getOptionLatex(option)}
                                    onChange={(latex) => handleOptionMathChange(optionIndex, latex)}
                                    placeholder={`Opción ${letter}`}
                                    compact
                                  />
                                ) : (
                                  <>
                                    <MathToolbar
                                      onInsert={(latex) => handleInsertLatexOption(optionIndex, latex)}
                                      className="rounded-b-none border-b-0 text-xs"
                                    />
                                    <input
                                      ref={(el) => { optionInputRefs.current[optionIndex] = el; }}
                                      type="text"
                                      value={option}
                                      onChange={(e) => handleOptionChange(optionIndex, e.target.value)}
                                      placeholder={`Opción ${letter}`}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-t-none rounded-b-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900"
                                    />
                                  </>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleOptionMathMode(optionIndex)}
                                className={`px-2 py-1.5 text-xs font-medium rounded border transition-colors flex-shrink-0 mt-1 ${
                                  isMathMode
                                    ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
                                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                                }`}
                                title={isMathMode ? 'Cambiar a modo texto' : 'Cambiar a editor matemático'}
                              >
                                {isMathMode ? 'Tx' : '𝑓x'}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeOption(optionIndex)}
                                className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md flex-shrink-0"
                              >
                                ✕
                              </button>
                            </div>
                            {!isMathMode && option.includes('$') && (
                              <div className="ml-14 mt-1 text-sm text-gray-700 px-3 py-1 bg-blue-50 rounded border border-blue-100">
                                <RichMathText text={option.replace(/^[A-Z]\)\s*/, '')} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={addOption}
                      className="mt-3 text-sm text-primary hover:text-primary-dark"
                    >
                      + Agregar opción
                    </button>
                  </>
                ) : (
                  /* === MODO PREVIEW === */
                  <div className="space-y-1">
                    {localOptions.map((option, optionIndex) => {
                      const letter = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][optionIndex] || String(optionIndex + 1);
                      const isCorrect = localCorrectAnswer === letter;
                      return (
                        <label
                          key={optionIndex}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                            isCorrect
                              ? 'bg-green-50 border border-green-200'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`question-${question.id}-preview`}
                            checked={isCorrect}
                            onChange={() => handleCorrectAnswerChange(letter)}
                            className="w-4 h-4 text-primary focus:ring-primary flex-shrink-0"
                          />
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                            isCorrect ? 'bg-green-200 text-green-800' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {letter}
                          </span>
                          <span className="text-gray-900 text-sm">
                            {option ? (
                              <RichMathText text={option.replace(/^[A-Z]\)\s*/, '')} />
                            ) : (
                              <span className="text-gray-400 italic">Opción vacía</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })()}

            {/* DESARROLLO */}
            {localType === QuestionType.DEVELOPMENT && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pauta de Corrección:
                </label>
                <textarea
                  value={localCriteria}
                  onChange={(e) => handleCriteriaChange(e.target.value)}
                  placeholder="Escribe los criterios de evaluación para esta respuesta abierta..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900"
                />
              </div>
            )}

            {/* MATEMÁTICA */}
            {localType === QuestionType.MATH && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Respuesta correcta:
                  </label>
                  <MathField
                    value={localCriteria}
                    onChange={handleCriteriaChange}
                    placeholder="Escribe la respuesta correcta"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Usa el editor matemático para escribir la respuesta esperada
                  </p>
                </div>

              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
