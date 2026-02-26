'use client';

import { Editor } from '@tiptap/react';
import { useState, useRef } from 'react';
import { ImageIcon, Upload } from 'lucide-react';
import { MATH_TOOLBAR_BUTTONS } from '@/components/MathToolbar';

interface TipTapToolbarProps {
  editor: Editor | null;
  onImageUpload?: (file: File) => Promise<string>;
  disabled?: boolean;
}

export default function TipTapToolbar({ editor, onImageUpload, disabled }: TipTapToolbarProps) {
  const [showMathButtons, setShowMathButtons] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const handleInsertMath = (latex: string) => {
    const cleanLatex = latex.replace(/#0/g, '');
    editor.commands.insertInlineMath({ latex: cleanLatex });
    editor.commands.focus();
  };

  const handleImageFile = async (file: File) => {
    if (!onImageUpload || !file.type.startsWith('image/')) return;
    setIsUploading(true);
    try {
      const url = await onImageUpload(file);
      editor.commands.setImage({ src: url });
      editor.commands.focus();
    } catch (err) {
      console.error('Error uploading image:', err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-50 border border-gray-200 border-b-0 rounded-t-lg">
      {/* Math symbols toggle */}
      <button
        type="button"
        onClick={() => setShowMathButtons(prev => !prev)}
        className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${
          showMathButtons
            ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
            : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
        }`}
        title="Símbolos matemáticos"
        disabled={disabled}
      >
        𝑓x
      </button>

      {/* Math buttons */}
      {showMathButtons && MATH_TOOLBAR_BUTTONS.map((btn, i) => (
        <button
          key={i}
          type="button"
          title={btn.title}
          disabled={disabled}
          className="px-2 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-teal-500 hover:text-white hover:border-teal-500 transition-colors min-w-[32px] disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={(e) => {
            e.preventDefault();
            handleInsertMath(btn.latex);
          }}
        >
          {btn.label}
        </button>
      ))}

      {/* Separator */}
      {onImageUpload && (
        <>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          {/* Image upload button */}
          <label
            className={`flex items-center gap-1 px-2 py-1 text-xs border rounded cursor-pointer transition-colors ${
              isUploading
                ? 'bg-gray-100 text-gray-400 border-gray-200'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-teal-500 hover:text-white hover:border-teal-500'
            }`}
            title="Insertar imagen"
          >
            {isUploading ? (
              <span className="animate-pulse">Subiendo...</span>
            ) : (
              <>
                <ImageIcon className="w-3.5 h-3.5" />
                <Upload className="w-3 h-3" />
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={disabled || isUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageFile(file);
                e.target.value = '';
              }}
            />
          </label>
        </>
      )}
    </div>
  );
}
