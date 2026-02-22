'use client';

import { useState, useEffect, useRef } from 'react';
import { Question, QuestionType } from '@/types';
import { Trash2, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import MathField from '@/components/MathField';
import MathToolbar from '@/components/MathToolbar';
import RichMathText from '@/components/RichMathText';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    onChange({ options: newOptions });
  };

  const removeOption = (optionIndex: number) => {
    const newOptions = localOptions.filter((_, i) => i !== optionIndex);
    setLocalOptions(newOptions);
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
            <RichMathText text={localText.substring(0, 50) + (localText.length > 50 ? '...' : '')} />
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Texto de la pregunta
            </label>
            <MathToolbar
              onInsert={handleInsertLatex}
              className="rounded-b-none border-b-0"
            />
            <textarea
              ref={textareaRef}
              value={localText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="Escribe el enunciado de la pregunta..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-t-none rounded-b-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900"
            />
            {/* Preview renderizado si hay LaTeX */}
            {localText.includes('$') && (
              <div className="mt-1 px-3 py-2 bg-blue-50 rounded-md border border-blue-100">
                <span className="text-xs text-blue-500 block mb-1">Vista previa:</span>
                <RichMathText text={localText} className="text-gray-900" />
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
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Opciones (marca la correcta):
                </label>
                <div className="space-y-2">
                  {localOptions.map((option, optionIndex) => {
                    const letter = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][optionIndex] || String(optionIndex + 1);
                    return (
                      <div key={optionIndex}>
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`question-${question.id}`}
                            checked={localCorrectAnswer === letter}
                            onChange={() => handleCorrectAnswerChange(letter)}
                            className="w-4 h-4 text-primary focus:ring-primary flex-shrink-0"
                          />
                          <span className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600 flex-shrink-0">
                            {letter}
                          </span>
                          <input
                            type="text"
                            value={option}
                            onChange={(e) => handleOptionChange(optionIndex, e.target.value)}
                            placeholder={`Opción ${letter}`}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900"
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(optionIndex)}
                            className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md"
                          >
                            ✕
                          </button>
                        </div>
                        {/* Preview si la opción tiene LaTeX */}
                        {option.includes('$') && (
                          <div className="ml-14 mt-0.5 text-sm text-gray-700">
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
