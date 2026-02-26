'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { InlineMath, BlockMath } from '@tiptap/extension-mathematics';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { useState, useCallback, useRef, useEffect } from 'react';
import type { Node as PmNode } from '@tiptap/pm/model';
import TipTapToolbar from './TipTapToolbar';
import MathEditPopup from './MathEditPopup';
import { plainTextToTipTapHtml, tipTapDocToPlainText, normalizeForComparison } from './serializers';
import 'katex/dist/katex.min.css';
import './tiptap-editor.css';

interface QuestionTipTapEditorProps {
  content: string;
  onChange: (plainText: string) => void;
  onImageUpload?: (file: File) => Promise<string>;
  placeholder?: string;
  disabled?: boolean;
}

interface MathEditState {
  latex: string;
  pos: number;
  nodeType: 'inlineMath' | 'blockMath';
  position: { top: number; left: number };
}

export default function QuestionTipTapEditor({
  content,
  onChange,
  onImageUpload,
  placeholder = 'Escribe el enunciado de la pregunta...',
  disabled = false,
}: QuestionTipTapEditorProps) {
  const [editingMath, setEditingMath] = useState<MathEditState | null>(null);
  const onChangeRef = useRef(onChange);
  const contentRef = useRef(content);
  const isInternalUpdate = useRef(false);

  // Keep refs current
  onChangeRef.current = onChange;
  contentRef.current = content;

  const handleMathClick = useCallback((node: PmNode, pos: number) => {
    // Get DOM position of the math node
    if (!editorRef.current) return;
    const view = editorRef.current.view;
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      const rect = dom.getBoundingClientRect();
      setEditingMath({
        latex: node.attrs.latex || '',
        pos,
        nodeType: node.type.name as 'inlineMath' | 'blockMath',
        position: { top: rect.bottom, left: rect.left },
      });
    }
  }, []);

  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable features we don't need
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        horizontalRule: false,
      }),
      InlineMath.configure({
        katexOptions: { throwOnError: false },
        onClick: handleMathClick,
      }),
      BlockMath.configure({
        katexOptions: { throwOnError: false, displayMode: true },
        onClick: handleMathClick,
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    immediatelyRender: false,
    content: plainTextToTipTapHtml(content),
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      isInternalUpdate.current = true;
      const doc = ed.getJSON();
      const text = tipTapDocToPlainText(doc);
      // Normalize both sides for comparison to avoid phantom changes
      // from whitespace/escaping differences in the round-trip
      const normalizedText = normalizeForComparison(text);
      const normalizedRef = normalizeForComparison(contentRef.current);
      if (normalizedText !== normalizedRef) {
        onChangeRef.current(text);
      }
      // Schedule clearing the flag
      requestAnimationFrame(() => {
        isInternalUpdate.current = false;
      });
    },
    editorProps: {
      attributes: {
        class: `tiptap-editor ${disabled ? 'disabled' : ''}`,
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !onImageUpload) return false;
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const file = files[0];
        if (!file.type.startsWith('image/')) return false;

        event.preventDefault();
        onImageUpload(file).then(url => {
          const { schema } = view.state;
          const node = schema.nodes.image.create({ src: url });
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (pos) {
            const tr = view.state.tr.insert(pos.pos, node);
            view.dispatch(tr);
          }
        });
        return true;
      },
    },
  });

  editorRef.current = editor;

  // Update editor content when prop changes externally
  useEffect(() => {
    if (!editor || isInternalUpdate.current) return;
    const currentDoc = editor.getJSON();
    const currentText = tipTapDocToPlainText(currentDoc);
    // Normalize both for comparison to avoid unnecessary re-renders
    if (normalizeForComparison(currentText) !== normalizeForComparison(content)) {
      const html = plainTextToTipTapHtml(content);
      editor.commands.setContent(html, { emitUpdate: false });
    }
  }, [content, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  const handleMathConfirm = useCallback((latex: string) => {
    if (!editor || !editingMath) return;
    if (editingMath.nodeType === 'inlineMath') {
      editor.commands.updateInlineMath({ latex, pos: editingMath.pos });
    } else {
      editor.commands.updateBlockMath({ latex, pos: editingMath.pos });
    }
    setEditingMath(null);
    editor.commands.focus();
  }, [editor, editingMath]);

  const handleMathDelete = useCallback(() => {
    if (!editor || !editingMath) return;
    if (editingMath.nodeType === 'inlineMath') {
      editor.commands.deleteInlineMath({ pos: editingMath.pos });
    } else {
      editor.commands.deleteBlockMath({ pos: editingMath.pos });
    }
    setEditingMath(null);
    editor.commands.focus();
  }, [editor, editingMath]);

  const handleMathCancel = useCallback(() => {
    setEditingMath(null);
    editor?.commands.focus();
  }, [editor]);

  return (
    <div>
      <TipTapToolbar
        editor={editor}
        onImageUpload={onImageUpload}
        disabled={disabled}
      />
      <EditorContent editor={editor} />
      {editingMath && (
        <MathEditPopup
          latex={editingMath.latex}
          position={editingMath.position}
          onConfirm={handleMathConfirm}
          onCancel={handleMathCancel}
          onDelete={handleMathDelete}
        />
      )}
    </div>
  );
}
