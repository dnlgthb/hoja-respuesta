'use client';

import { useState, useEffect, useRef } from 'react';
import { Question, QuestionType } from '@/types';
import { Trash2, ChevronUp, ChevronDown, GripVertical, Pencil, Check } from 'lucide-react';
import MathField from '@/components/MathField';
import MathToolbar from '@/components/MathToolbar';
import RichMathText from '@/components/RichMathText';

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
  onChange: (updatedQuestion: Partial<Question>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  requireFalseJustification?: boolean;
  isFirst: boolean;
  isLast: boolean;
}

export default function QuestionEditor({
  question,
  index,
  totalQuestions,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  requireFalseJustification = false,
  isFirst,
  isLast,
}: QuestionEditorProps) {
  // Usar snake_case del backend como fallback
  const questionLabel = question.questionLabel || question.question_label || String(index + 1);
  const questionText = question.questionText || question.question_text || '';
  const questionType = question.questionType || question.type || QuestionType.DEVELOPMENT;
  const correctAnswer = question.correctAnswer || question.correct_answer || '';
  const correctionCriteria = question.correctionCriteria || question.correction_criteria || '';
  const requireUnits = question.requireUnits ?? question.require_units ?? false;
  const unitPenalty = question.unitPenalty ?? question.unit_penalty ?? 0.5;

  const [localLabel, setLocalLabel] = useState(questionLabel);
  const [localText, setLocalText] = useState(questionText);
  const [localType, setLocalType] = useState<QuestionType>(questionType);
  const [localCorrectAnswer, setLocalCorrectAnswer] = useState(correctAnswer);
  const [localCriteria, setLocalCriteria] = useState(correctionCriteria);
  const [localOptions, setLocalOptions] = useState<string[]>(question.options || []);
  const [localPoints, setLocalPoints] = useState(question.points || 1);
  const [localRequireUnits, setLocalRequireUnits] = useState(requireUnits);
  const [localUnitPenalty, setLocalUnitPenalty] = useState(String(unitPenalty * 100));
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditingText, setIsEditingText] = useState(false);
  const [isEditingOptions, setIsEditingOptions] = useState(false);
  const [textMathMode, setTextMathMode] = useState<boolean>(true);
  const [optionMathMode, setOptionMathMode] = useState<boolean[]>(
    () => (question.options || []).map(opt => /\$/.test(opt))
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const optionInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Insertar LaTeX en el textarea del texto de la pregunta
  const handleInsertLatex = (latex: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    // Limpiar placeholders #0 de MathToolbar
    const cleanLatex = latex.replace(/#0/g, '');
    // Envolver en $...$ si no lo está
    const wrapped = cleanLatex.startsWith('$') ? cleanLatex : `$${cleanLatex}$`;

    const before = localText.slice(0, start);
    const after = localText.slice(end);
    const newText = before + wrapped + after;

    handleTextChange(newText);

    // Restaurar foco y posicionar cursor dentro de la expresión
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPos = start + wrapped.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  };

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

  // Convert mixed text "abc $math$ def" → "\text{abc }math\text{ def}" for MathField
  const mixedTextToMathLatex = (text: string): string => {
    if (!text.includes('$')) return text;
    const trimmed = text.trim();
    // Pure math: just strip delimiters
    if (trimmed.startsWith('$') && trimmed.endsWith('$') && !trimmed.slice(1, -1).includes('$')) {
      return trimmed.slice(1, -1);
    }
    const parts: string[] = [];
    let pos = 0;
    while (pos < text.length) {
      const dollarIdx = text.indexOf('$', pos);
      if (dollarIdx === -1) {
        const rest = text.slice(pos);
        if (rest) parts.push(`\\text{${rest}}`);
        break;
      }
      if (dollarIdx > pos) parts.push(`\\text{${text.slice(pos, dollarIdx)}}`);
      const isDouble = text[dollarIdx + 1] === '$';
      const openLen = isDouble ? 2 : 1;
      const closeDelim = isDouble ? '$$' : '$';
      const closeIdx = text.indexOf(closeDelim, dollarIdx + openLen);
      if (closeIdx === -1) { parts.push(text.slice(dollarIdx + openLen)); break; }
      parts.push(text.slice(dollarIdx + openLen, closeIdx));
      pos = closeIdx + openLen;
    }
    return parts.join('');
  };

  // Convert MathField latex "\text{abc }math\text{ def}" → "abc $math$ def"
  const mathLatexToMixedText = (latex: string): string => {
    if (!latex.includes('\\text{')) return latex.trim() ? `$${latex}$` : '';
    const parts: string[] = [];
    let pos = 0;
    while (pos < latex.length) {
      const textIdx = latex.indexOf('\\text{', pos);
      if (textIdx === -1) {
        const rest = latex.slice(pos).trim();
        if (rest) parts.push(`$${rest}$`);
        break;
      }
      if (textIdx > pos) {
        const math = latex.slice(pos, textIdx).trim();
        if (math) parts.push(`$${math}$`);
      }
      // Find matching closing brace
      let depth = 1;
      let braceEnd = textIdx + 6;
      while (braceEnd < latex.length && depth > 0) {
        if (latex[braceEnd] === '{') depth++;
        if (latex[braceEnd] === '}') { depth--; if (depth === 0) break; }
        braceEnd++;
      }
      parts.push(latex.slice(textIdx + 6, braceEnd));
      pos = braceEnd + 1;
    }
    return parts.join('');
  };

  const getTextLatex = (text: string): string => {
    if (!text.includes('$')) return text ? `\\text{${text}}` : '';
    return mixedTextToMathLatex(text);
  };

  const handleTextMathChange = (latex: string) => {
    handleTextChange(mathLatexToMixedText(latex));
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
    setLocalText(questionText);
    setLocalType(questionType);
    setLocalCorrectAnswer(correctAnswer);
    setLocalCriteria(correctionCriteria);
    setLocalOptions(question.options || []);
    setLocalPoints(question.points || 1);
    setLocalRequireUnits(requireUnits);
    setLocalUnitPenalty(String(unitPenalty * 100));
  }, [questionLabel, questionText, questionType, correctAnswer, correctionCriteria, question.options, question.points, requireUnits, unitPenalty]);

  // Reset edit states when collapsing
  useEffect(() => {
    if (!isExpanded) {
      setIsEditingText(false);
      setIsEditingOptions(false);
    }
  }, [isExpanded]);

  // Auto-focus textarea when entering edit mode (only in text mode)
  useEffect(() => {
    if (isEditingText && !textMathMode && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditingText, textMathMode]);

  const handleLabelChange = (value: string) => {
    setLocalLabel(value);
    onChange({ question_label: value });
  };

  const handleTextChange = (value: string) => {
    setLocalText(value);
    onChange({ question_text: value });
  };

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
            <RichMathText text={truncateLatexAware(localText, 80)} />
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

          {/* Texto de la pregunta */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Texto de la pregunta
              </label>
              <div className="flex items-center gap-1">
                {isEditingText && (
                  <button
                    type="button"
                    onClick={() => setTextMathMode(prev => !prev)}
                    className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${
                      textMathMode
                        ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
                        : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                    }`}
                    title={textMathMode ? 'Cambiar a modo texto' : 'Cambiar a editor matemático'}
                  >
                    {textMathMode ? 'Tx' : '𝑓x'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditingText(!isEditingText)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-primary hover:bg-primary/5 rounded transition-colors"
                  title={isEditingText ? 'Cerrar editor' : 'Editar texto'}
                >
                  {isEditingText ? (
                    <><Check className="w-3.5 h-3.5" /><span>Listo</span></>
                  ) : (
                    <><Pencil className="w-3.5 h-3.5" /><span>Editar</span></>
                  )}
                </button>
              </div>
            </div>

            {isEditingText ? (
              textMathMode ? (
                <MathField
                  value={getTextLatex(localText)}
                  onChange={handleTextMathChange}
                  placeholder="Escribe la expresión matemática..."
                />
              ) : (
                <>
                  <MathToolbar
                    onInsert={handleInsertLatex}
                    className="rounded-b-none border-b-0"
                  />
                  <textarea
                    ref={textareaRef}
                    value={localText}
                    onChange={(e) => handleTextChange(e.target.value)}
                    placeholder="Escribe el enunciado de la pregunta..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-t-none rounded-b-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900"
                  />
                  {localText && localText.includes('$') && (
                    <div className="mt-1 px-3 py-2 bg-blue-50 rounded-md border border-blue-100">
                      <span className="text-xs text-blue-500 block mb-1">Vista previa:</span>
                      <RichMathText text={localText} className="text-gray-900" />
                    </div>
                  )}
                </>
              )
            ) : (
              <div
                className="px-3 py-2 bg-gray-50 rounded-md border border-gray-200 min-h-[2.5rem] cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => setIsEditingText(true)}
              >
                {localText ? (
                  <RichMathText text={localText} className="text-gray-900" />
                ) : (
                  <span className="text-gray-400 italic">Sin texto de pregunta</span>
                )}
              </div>
            )}
          </div>

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
            {localType === QuestionType.MULTIPLE_CHOICE && (
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
            )}

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

                <div className="bg-gray-50 rounded-md p-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localRequireUnits}
                      onChange={(e) => handleRequireUnitsChange(e.target.checked)}
                      className="mt-1 w-4 h-4 text-primary rounded focus:ring-primary"
                    />
                    <div>
                      <span className="font-medium text-gray-900">Exigir unidades en la respuesta</span>
                      <p className="text-xs text-gray-500">La IA verificará si el estudiante incluye las unidades correctas</p>
                    </div>
                  </label>
                  {localRequireUnits && (
                    <div className="ml-7 mt-2 flex items-center gap-2">
                      <label className="text-sm text-gray-700">Descuento si faltan o están mal:</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={localUnitPenalty}
                        onChange={(e) => handleUnitPenaltyChange(e.target.value)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:ring-2 focus:ring-primary"
                      />
                      <span className="text-sm text-gray-700">%</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
