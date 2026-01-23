'use client';

import { useState, useEffect } from 'react';
import { Question, QuestionType } from '@/types';

interface QuestionEditorProps {
  question: Question;
  index: number;
  onChange: (updatedQuestion: Partial<Question>) => void;
}

export default function QuestionEditor({ question, index, onChange }: QuestionEditorProps) {
  // Usar snake_case del backend como fallback
  const questionText = question.questionText || question.question_text || '';
  const questionType = question.questionType || question.type || QuestionType.DEVELOPMENT;
  const correctAnswer = question.correctAnswer || question.correct_answer || '';
  const correctionCriteria = question.correctionCriteria || question.correction_criteria || '';
  
  const [localCorrectAnswer, setLocalCorrectAnswer] = useState(correctAnswer);
  const [localCriteria, setLocalCriteria] = useState(correctionCriteria);
  const [localOptions, setLocalOptions] = useState<string[]>(question.options || []);
  const [localPoints, setLocalPoints] = useState(question.points || 1);

  useEffect(() => {
    // Sincronizar con cambios externos
    setLocalCorrectAnswer(correctAnswer);
    setLocalCriteria(correctionCriteria);
    setLocalOptions(question.options || []);
    setLocalPoints(question.points || 1);
  }, [correctAnswer, correctionCriteria, question.options, question.points]);

  const handleCorrectAnswerChange = (value: string) => {
    setLocalCorrectAnswer(value);
    onChange({ correct_answer: value });
  };

  const handleCriteriaChange = (value: string) => {
    setLocalCriteria(value);
    onChange({ correction_criteria: value });
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

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      {/* Question Header */}
      <div className="mb-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">
            Pregunta {index + 1}
          </h3>
          <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
            {questionType.replace('_', ' ')}
          </span>
        </div>
        <p className="text-gray-700 text-sm leading-relaxed">
          {questionText}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <label className="text-xs text-gray-500">Puntaje:</label>
          <input
            type="number"
            min="1"
            max="100"
            value={localPoints}
            onChange={(e) => handlePointsChange(Number(e.target.value))}
            className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <span className="text-xs text-gray-500">puntos</span>
        </div>
      </div>

      {/* Editor según tipo de pregunta */}
      <div className="border-t border-gray-200 pt-4">
        
        {/* VERDADERO/FALSO */}
        {questionType === 'TRUE_FALSE' && (
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
          </div>
        )}

        {/* MÚLTIPLE OPCIÓN */}
        {questionType === 'MULTIPLE_CHOICE' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Opciones (marca la correcta):
            </label>
            <div className="space-y-2">
              {localOptions.map((option, optionIndex) => (
                <div key={optionIndex} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    checked={localCorrectAnswer === option}
                    onChange={() => handleCorrectAnswerChange(option)}
                    className="w-4 h-4 text-primary focus:ring-primary flex-shrink-0"
                  />
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => handleOptionChange(optionIndex, e.target.value)}
                    placeholder={`Opción ${optionIndex + 1}`}
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
              ))}
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

        {/* DESARROLLO/ABIERTA */}
        {questionType === 'DEVELOPMENT' && (
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
            <p className="text-xs text-gray-500 mt-1">
              La IA usará esta pauta para evaluar las respuestas de los estudiantes
            </p>
          </div>
        )}

        {/* NUMÉRICA */}
        {questionType === 'MATH' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Respuesta Correcta (numérica):
            </label>
            <input
              type="text"
              value={localCorrectAnswer}
              onChange={(e) => handleCorrectAnswerChange(e.target.value)}
              placeholder="Ej: 42 o 3.14"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900"
            />
            <p className="text-xs text-gray-500 mt-1">
              Puedes especificar un rango: "40-44" o un valor exacto: "42"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
