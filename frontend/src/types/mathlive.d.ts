declare namespace JSX {
  interface IntrinsicElements {
    'math-field': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        'virtual-keyboard-mode'?: 'auto' | 'manual' | 'off';
        'read-only'?: boolean;
        placeholder?: string;
      },
      HTMLElement
    >;
  }
}
