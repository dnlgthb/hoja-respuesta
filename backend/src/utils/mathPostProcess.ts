/**
 * Post-processing for AI-extracted math text.
 * Converts Unicode math symbols to LaTeX and ensures proper $...$ delimiters.
 * Applied BEFORE saving to database so the source data is clean.
 */

/**
 * Fix JSON string BEFORE JSON.parse to prevent LaTeX backslash destruction.
 *
 * Problem: When AI returns JSON like {"text": "$\frac{3}{4}$"}, JSON.parse
 * interprets \f as form-feed (0x0C), \t as tab (0x09), \n as newline, etc.
 * This destroys LaTeX commands: \frac → <FF>rac, \times → <TAB>imes, etc.
 *
 * Solution: Inside JSON string values, find unescaped backslashes followed by
 * known LaTeX command prefixes and double-escape them so JSON.parse preserves them.
 *
 * This MUST be called on the raw JSON string BEFORE JSON.parse().
 */
export function fixLatexInJsonString(jsonStr: string): string {
  if (!jsonStr) return jsonStr;

  // JSON escape sequences that conflict with LaTeX commands:
  // \f (form feed)  → \frac, \forall
  // \t (tab)        → \times, \text, \theta, \tau, \triangle, \to
  // \n (newline)    → \neq, \nu, \neg, \nabla, \notin
  // \r (CR)         → \right, \rho, \Rightarrow
  // \b (backspace)  → \bar, \beta, \begin, \binom
  //
  // Strategy: Inside JSON string literals (between quotes), replace
  // \X where X starts a known LaTeX command with \\X
  //
  // We process the raw JSON character by character, only modifying
  // content inside string values.

  let result = '';
  let inString = false;
  let i = 0;

  while (i < jsonStr.length) {
    const ch = jsonStr[i];

    if (!inString) {
      if (ch === '"') {
        inString = true;
      }
      result += ch;
      i++;
      continue;
    }

    // Inside a JSON string
    if (ch === '"') {
      // End of string (unescaped quote)
      inString = false;
      result += ch;
      i++;
      continue;
    }

    if (ch === '\\') {
      const next = i + 1 < jsonStr.length ? jsonStr[i + 1] : '';

      // Already a valid JSON escape: \\, \", \/, \n, \r, \t, \b, \f, \uXXXX
      // But we need to check if \n, \r, \t, \b, \f are actually LaTeX commands

      if (next === '\\') {
        // Already double-escaped: \\  → pass through both
        result += '\\\\';
        i += 2;
        continue;
      }

      if (next === '"' || next === '/') {
        // Valid JSON escapes that don't conflict with LaTeX
        result += ch + next;
        i += 2;
        continue;
      }

      if (next === 'u' && i + 5 < jsonStr.length && /^[0-9a-fA-F]{4}$/.test(jsonStr.slice(i + 2, i + 6))) {
        // Unicode escape \uXXXX - pass through
        result += jsonStr.slice(i, i + 6);
        i += 6;
        continue;
      }

      // Check if this is a LaTeX command that conflicts with JSON escapes
      const rest = jsonStr.slice(i + 1, i + 20); // look ahead

      // \f → could be \frac, \forall, \flat, etc.
      // \t → could be \times, \text, \theta, \tau, \to, \triangle, etc.
      // \n → could be \neq, \nu, \neg, \nabla, \notin, etc.
      // \r → could be \right, \rho, \Rightarrow, etc.
      // \b → could be \bar, \beta, \begin, \binom, etc.
      // Also handle: \s → \sqrt, \sum, \sigma, \sin, \sec, \subset, \sim, \Sigma
      //              \l → \left, \lambda, \leq, \ll, \log, \ln, \land, \lor, \Lambda, \Leftarrow, \Leftrightarrow
      //              \c → \cdot, \cos, \cot, \csc, \cap, \cup, \chi, \circ
      //              \d → \div, \delta, \dot, \Delta
      //              \p → \pi, \pm, \partial, \perp, \prod, \propto, \parallel, \Phi, \Psi, \Pi
      //              \a → \alpha, \approx, \angle, \ast
      //              \g → \gamma, \geq, \gg, \Gamma
      //              \e → \epsilon, \varepsilon, \eta, \equiv, \emptyset, \exists, \end
      //              \v → \vec, \varphi, \varepsilon
      //              \h → \hat
      //              \i → \int, \infty, \in, \iota
      //              \m → \mu, \mp, \mathrm, \mathbf
      //              \o → \overline, \omega, \Omega
      //              \k → \kappa
      //              \z → \zeta
      //              \x → \xi, \Xi
      //              \u → \upsilon, \underline (but careful with \uXXXX)
      //              \w → (not common but \wedge)
      //              \S → \Sigma (already handled by \s case? No, \S is uppercase)
      //              \P → \Pi, \Phi, \Psi
      //              \R → \Rightarrow
      //              \L → \Lambda, \Leftarrow, \Leftrightarrow

      // The problematic JSON escape chars are: f, t, n, r, b
      // For these, we MUST check if they start a LaTeX command
      if (next === 'f' || next === 't' || next === 'n' || next === 'r' || next === 'b') {
        // Check if this looks like a LaTeX command (letter followed by more letters)
        const afterBackslash = rest; // starts with the letter after backslash
        const latexMatch = afterBackslash.match(/^([a-zA-Z]+)/);
        if (latexMatch) {
          const cmd = latexMatch[1];
          // Known LaTeX commands starting with these letters
          const knownCommands: Record<string, string[]> = {
            f: ['frac', 'forall', 'flat'],
            t: ['times', 'text', 'theta', 'tau', 'to', 'triangle', 'tan'],
            n: ['neq', 'nu', 'neg', 'nabla', 'notin'],
            r: ['right', 'rho', 'Rightarrow'],
            b: ['bar', 'beta', 'begin', 'binom', 'bmod'],
          };

          const candidates = knownCommands[next] || [];
          // Must match at least 2 chars to avoid false positives (\n, \t, \r, \b, \f)
          if (cmd.length > 1 && candidates.some(c => cmd.startsWith(c) || c.startsWith(cmd))) {
            // This IS a LaTeX command that would be destroyed by JSON.parse
            // Double-escape it: \frac → \\frac
            result += '\\\\';
            i += 1; // skip the backslash, the letter will be added in next iteration
            continue;
          }

          // Fallback: check if text after the escape letter is itself a known LaTeX command.
          // e.g., \ncdot: 'n' consumed by \n, but 'cdot' is the real \cdot command.
          // The AI writes \ncdot instead of \cdot, so \n eats the backslash and 'cdot' is orphaned.
          if (cmd.length > 2) {
            const afterEscapeLetter = cmd.slice(1);
            const knownLatexCmds = [
              'cdot', 'cdots', 'cos', 'cot', 'csc', 'cap', 'cup', 'chi', 'circ',
              'sqrt', 'sum', 'sin', 'sec', 'sigma', 'subset', 'sim',
              'frac', 'forall', 'flat',
              'times', 'text', 'theta', 'tau', 'triangle', 'tan',
              'right', 'rho', 'bar', 'beta', 'begin', 'binom',
              'left', 'lambda', 'leq', 'log', 'ln',
              'alpha', 'approx', 'angle',
              'gamma', 'geq', 'delta', 'div', 'dot',
              'pi', 'pm', 'partial', 'perp', 'prod',
              'vec', 'mu', 'omega', 'kappa', 'zeta', 'xi', 'eta', 'epsilon',
              'mathrm', 'mathbf', 'overline', 'hat', 'infty',
              'neq', 'nu', 'neg', 'nabla', 'notin',
            ];
            const matchedCmd = knownLatexCmds.find(lc => afterEscapeLetter === lc);
            if (matchedCmd) {
              // Broken LaTeX: \ncdot is really \cdot with stray \n
              // Emit \\cdot and skip past the entire broken sequence
              result += '\\\\' + matchedCmd;
              i += 2 + matchedCmd.length; // skip \n + matched command letters
              continue;
            }
          }
        }

        // Not a LaTeX command - it's a real JSON escape (\n, \t, etc.)
        result += ch + next;
        i += 2;
        continue;
      }

      // For all other letters after backslash, these aren't valid JSON escapes
      // so they're likely LaTeX commands. Double-escape them.
      if (/[a-zA-Z]/.test(next)) {
        result += '\\\\';
        i += 1; // skip backslash only
        continue;
      }

      // Any other case (e.g., \{, \}, etc.) - pass through
      result += ch;
      i++;
      continue;
    }

    // Regular character
    result += ch;
    i++;
  }

  return result;
}

/**
 * Repair strings AFTER JSON.parse that had their LaTeX backslashes
 * destroyed by JSON escape sequence interpretation.
 *
 * This is a safety net for text already in the database or already parsed.
 * Maps control characters back to LaTeX commands:
 *   form-feed + "rac"  → \frac
 *   tab + "imes"       → \times
 *   etc.
 */
export function repairBrokenLatex(text: string): string {
  if (!text) return text;

  // Map of: control_char + suffix → LaTeX command
  const repairs: [RegExp, string][] = [
    // \f (0x0C form feed) → \frac, \forall
    [/\x0Crac\b/g, '\\frac'],
    [/\x0Corall\b/g, '\\forall'],

    // \t (0x09 tab) → \times, \text, \theta, \tau, \to, \triangle, \tan
    [/\x09imes\b/g, '\\times'],
    [/\x09ext\b/g, '\\text'],
    [/\x09heta\b/g, '\\theta'],
    [/\x09au\b/g, '\\tau'],
    [/\x09o\b/g, '\\to'],
    [/\x09riangle\b/g, '\\triangle'],
    [/\x09an\b/g, '\\tan'],

    // \n (0x0A newline) → \neq, \nu, \neg, \nabla, \notin
    [/\neq\b/g, '\\neq'],
    [/\nu\b/g, '\\nu'],
    [/\neg\b/g, '\\neg'],
    [/\nabla\b/g, '\\nabla'],
    [/\notin\b/g, '\\notin'],

    // \r (0x0D carriage return) → \right, \rho, \Rightarrow
    [/\right\b/g, '\\right'],
    [/\rho\b/g, '\\rho'],

    // \b (0x08 backspace) → \bar, \beta, \begin, \binom
    [/\x08ar\b/g, '\\bar'],
    [/\x08eta\b/g, '\\beta'],
    [/\x08egin\b/g, '\\begin'],
    [/\x08inom\b/g, '\\binom'],
  ];

  let result = text;
  for (const [pattern, replacement] of repairs) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Fix AI-generated \text{} wrappers around LaTeX commands.
 * GPT-4o sometimes outputs \text{\sqrt}X, \text{\pi}, \text{^{\circ}} etc.
 * These need to be converted to proper LaTeX.
 *
 * NOTE: Due to fixLatexInJsonString double-escaping already-escaped backslashes,
 * the actual string may contain \\text{\\sqrt} (double backslash) instead of
 * \text{\sqrt} (single). We use \\{1,2} to match both cases.
 */
function fixTextWrappedLatex(text: string): string {
  // Helper: match 1 or 2 backslashes (handles both single and double-escaped)
  const BS = '\\\\{1,2}'; // matches \ or \\

  // --- SQRT patterns (Phase 2 mangles \sqrt in many ways) ---

  // \text{\textsqrt{X}} → \sqrt{X}  (gpt-4o-mini invents \textsqrt)
  text = text.replace(new RegExp(`${BS}text\\{${BS}textsqrt\\{([^}]*)\\}\\}`, 'g'), '\\sqrt{$1}');

  // \text{sqrt{X}} → \sqrt{X}  (drops backslash, wraps in \text{})
  text = text.replace(/\\{1,2}text\{sqrt\{([^}]*)\}\}/g, '\\sqrt{$1}');

  // \text{sqrt}{X} → \sqrt{X}  (drops backslash, arg outside \text{})
  text = text.replace(/\\{1,2}text\{sqrt\}\{([^}]*)\}/g, '\\sqrt{$1}');
  text = text.replace(/\\{1,2}text\{sqrt\}(\d+)/g, '\\sqrt{$1}');
  text = text.replace(/\\{1,2}text\{sqrt\}([a-zA-Z])/g, '\\sqrt{$1}');
  // Bare \text{sqrt} at end
  text = text.replace(/\\{1,2}text\{sqrt\}/g, '\\sqrt');

  // \text{\sqrt{X}} → \sqrt{X}  (original pattern with backslash)
  text = text.replace(new RegExp(`${BS}text\\{${BS}sqrt\\{([^}]*)\\}\\}`, 'g'), '\\sqrt{$1}');
  // \text{\sqrt}X patterns
  text = text.replace(new RegExp(`${BS}text\\{${BS}sqrt\\}(\\d+)`, 'g'), '\\sqrt{$1}');
  text = text.replace(new RegExp(`${BS}text\\{${BS}sqrt\\}([a-zA-Z])`, 'g'), '\\sqrt{$1}');
  text = text.replace(new RegExp(`${BS}text\\{${BS}sqrt\\}`, 'g'), '\\sqrt');

  // --- Mathpix tilde artifacts (~  = thin space in Mathpix \mathrm{~X} output) ---
  // \text{~X} → \mathrm{X}  (Phase 2 converts \mathrm to \text, keep tilde-free)
  text = text.replace(/\\{1,2}text\{~([^}]*)\}/g, '\\mathrm{$1}');
  // Clean stray tildes inside LaTeX args: \sqrt{~h} → \sqrt{h}, \mathrm{~h} → \mathrm{h}
  text = text.replace(/(\\(?:sqrt|mathrm|mathbf|text)\{)~(\s*)/g, '$1$2');
  // Also \mathrm{~ h} → \mathrm{h}
  text = text.replace(/(\\(?:sqrt|mathrm|mathbf|text)\{)~\s+/g, '$1');

  // --- Standard \text{} wrapped LaTeX commands ---

  // \text{\pi} → \pi
  text = text.replace(new RegExp(`${BS}text\\{${BS}pi\\}`, 'g'), '\\pi');

  // ^{\text{^{\circ}X}} → ^{\circ}\mathrm{X}  (X = optional unit like C, F)
  text = text.replace(new RegExp(`\\^\\{${BS}text\\{\\^\\{${BS}circ\\}([A-Za-z]*)\\}\\}`, 'g'),
    (_, unit) => unit ? `^{\\circ}\\mathrm{${unit}}` : '^{\\circ}');
  // ^{\text{°X}} → ^{\circ}\mathrm{X}  (Unicode ° before conversion)
  text = text.replace(new RegExp(`\\^\\{${BS}text\\{°([A-Za-z]*)\\}\\}`, 'g'),
    (_, unit) => unit ? `^{\\circ}\\mathrm{${unit}}` : '^{\\circ}');
  // \text{°X} → ^{\circ}\mathrm{X}  (bare, not inside ^{})
  text = text.replace(new RegExp(`${BS}text\\{°([A-Za-z]*)\\}`, 'g'),
    (_, unit) => unit ? `^{\\circ}\\mathrm{${unit}}` : '^{\\circ}');
  // \text{\textdegree} → ^{\circ}  (Phase 2 sometimes uses \textdegree)
  text = text.replace(new RegExp(`${BS}text\\{${BS}textdegree\\}`, 'g'), '^{\\circ}');
  // \textdegree → ^{\circ}  (bare, without \text wrapper)
  text = text.replace(new RegExp(`${BS}textdegree`, 'g'), '^{\\circ}');
  // \textcirc → \circ  (Phase 2 invents \textcirc)
  text = text.replace(new RegExp(`${BS}textcirc\\b`, 'g'), '\\circ');
  // \text{\circ} → \circ
  text = text.replace(new RegExp(`${BS}text\\{${BS}circ\\}`, 'g'), '\\circ');

  // \text{\alpha}, \text{\beta}, etc.
  const greekLetters = ['alpha', 'beta', 'gamma', 'delta', 'theta', 'lambda', 'sigma', 'omega', 'mu', 'epsilon', 'phi', 'psi', 'rho', 'tau', 'nu', 'kappa', 'xi', 'zeta', 'eta', 'iota', 'upsilon', 'chi'];
  for (const letter of greekLetters) {
    text = text.replace(new RegExp(`${BS}text\\{${BS}${letter}\\}`, 'g'), `\\${letter}`);
  }

  // \text{\times} → \times, \text{\cdot} → \cdot, etc.
  const operators = ['times', 'cdot', 'div', 'pm', 'neq', 'geq', 'leq', 'infty', 'approx',
    'leftarrow', 'rightarrow', 'uparrow', 'downarrow', 'to', 'angle', 'perp', 'parallel'];
  for (const op of operators) {
    text = text.replace(new RegExp(`${BS}text\\{${BS}${op}\\}`, 'g'), `\\${op}`);
  }
  // Also \text{cdot} → \cdot (AI drops the backslash inside \text{})
  for (const op of operators) {
    text = text.replace(new RegExp(`${BS}text\\{${op}\\}`, 'g'), `\\${op}`);
  }

  // --- General catch-all: \text{\commandArgs} → \command Args ---
  // Handles cases like \text{\angleCDB} → \angle CDB, \text{\overlineAB} → \overline AB
  // LaTeX commands are lowercase; uppercase letters after them are arguments
  text = text.replace(new RegExp(`${BS}text\\{(${BS}[a-z]+)([A-Z][^}]*)\\}`, 'g'), (_, cmd, rest) => {
    const normalizedCmd = cmd.replace(/^\\\\/, '\\');
    return `${normalizedCmd} ${rest}`;
  });

  // --- \text{x} → x for single-letter variables (Phase 2 wraps variables in \text{}) ---
  // In math mode, single letters should be italic (default), not upright (\text{}).
  // Handles function names (f, g, h), variables (x, y, n), and points (A, B, C).
  text = text.replace(/\\text\{([a-zA-Z])\}/g, '$1');

  // --- \rightarrow{X} → \vec{X} for vector notation ---
  // Phase 2 uses \rightarrow{F} instead of \vec{F} for vector arrows
  text = text.replace(/\\rightarrow\{([^}]*)\}/g, '\\vec{$1}');

  // --- \$(...$\) → $...$ fix malformed math delimiters ---
  // Phase 2 sometimes mangles $\frac{1}{3}$ into \$(\frac{1}{3}$\)
  text = text.replace(/\\\$\(([^$]*)\$\\\)/g, (_, content) => {
    return `$${content}$`;
  });

  // --- \$ inside math → move dollar sign outside math ---
  // $\$ 30000$ → \$30000 (currency amount, no math needed)
  // $\$\left(3 \cdot 30000 \cdot \frac{20}{100}\right)$ → \$ $\left(...)$
  // The frontend parser converts \$ to literal $ outside math mode
  text = text.replace(/\$\\\$\s*([^$]+)\$/g, (match, content) => {
    const trimmed = content.trim();
    // If content is just a number/currency amount, no math needed
    if (/^[\d.,\s]+$/.test(trimmed)) {
      return `\\$${trimmed}`;
    }
    // Otherwise, keep content in math but move \$ outside
    return `\\$ $${trimmed}$`;
  });

  // --- \sqrt(X) → \sqrt{X} (Phase 2 sometimes uses parens instead of braces) ---
  // Match \sqrt( then balanced content until )
  text = text.replace(/\\sqrt\(([^)]*)\)/g, '\\sqrt{$1}');

  // --- \textdollar → \$ (Phase 2 uses \textdollar for dollar signs) ---
  text = text.replace(/\\text\{\\textdollar\}/g, '\\$');
  text = text.replace(/\\textdollar/g, '\\$');

  // --- Phase 2 inserts \n\text{ } padding around operators ---
  // "$7 \cdot 25$" becomes "$7 \n\text{ } \cdot 25$" in JSON
  // After JSON.parse the \n is a real newline. Clean: newline + \text{ } → single space
  text = text.replace(/\n\s*\\text\{\s*\}/g, ' ');

  // --- \times → \cdot (Phase 2 converts \cdot to \times; Mathpix never uses \times) ---
  text = text.replace(/\\times/g, '\\cdot');

  // --- Bare \% outside $...$ → just % (Mathpix uses \% for percent in text) ---
  // Only replace \% that is NOT inside $...$; postProcessMathText handles segmentation,
  // but \% in plain text should just be %
  text = text.replace(/\\%/g, '%');

  // --- \, (thin space) used instead of \cdot → \cdot (Phase 2 sometimes swaps these) ---
  // Inside math: $2 \, \frac{1}{3} \, (8-6)$ should use \cdot not \,
  // Replace \, when between math operands (number/brace/paren and frac/sqrt/number/letter/paren)
  // Use lookahead (?=...) so the right operand isn't consumed — allows chained matches: 2 \, 3 \, 8
  text = text.replace(/(\d|}|\))\s*\\,\s*(?=\\frac|\\sqrt|\d|[a-zA-Z(])/g, '$1 \\cdot ');

  // --- Double backslash before LaTeX commands inside math: \\cmd → \cmd ---
  // Phase 2 sometimes over-escapes: \\cdot, \\times, \\frac, etc.
  const allCmds = ['frac', 'sqrt', 'cdot', 'times', 'div', 'pm', 'mp', 'neq', 'geq', 'leq',
    'sim', 'approx', 'infty', 'pi', 'left', 'right', 'mathrm', 'mathbf', 'quad',
    'text', 'vec', 'overline', 'hat', 'bar', 'log', 'ln', 'sin', 'cos', 'tan',
    'angle', 'perp', 'parallel', 'leftarrow', 'rightarrow', 'uparrow', 'downarrow', 'to',
    ...greekLetters];
  for (const cmd of allCmds) {
    // Match \\cmd but not \\\cmd (already triple-escaped or escaped backslash + cmd)
    text = text.replace(new RegExp(`(?<!\\\\)\\\\\\\\(${cmd})\\b`, 'g'), `\\$1`);
  }

  return text;
}

// Unicode → LaTeX replacement map
const UNICODE_TO_LATEX: [RegExp, string][] = [
  // Operators
  [/×/g, '\\times'],
  [/÷/g, '\\div'],
  [/±/g, '\\pm'],
  [/∓/g, '\\mp'],
  [/·/g, '\\cdot'],
  [/∗/g, '\\ast'],

  // Comparisons
  [/≤/g, '\\leq'],
  [/≥/g, '\\geq'],
  [/≠/g, '\\neq'],
  [/≈/g, '\\approx'],
  [/≡/g, '\\equiv'],
  [/∼/g, '\\sim'],
  [/≪/g, '\\ll'],
  [/≫/g, '\\gg'],
  [/∝/g, '\\propto'],

  // Arrows
  [/→/g, '\\to'],
  [/←/g, '\\leftarrow'],
  [/↑/g, '\\uparrow'],
  [/↓/g, '\\downarrow'],
  [/↔/g, '\\leftrightarrow'],
  [/⇒/g, '\\Rightarrow'],
  [/⇐/g, '\\Leftarrow'],
  [/⇔/g, '\\Leftrightarrow'],

  // Greek letters (lowercase)
  [/α/g, '\\alpha'],
  [/β/g, '\\beta'],
  [/γ/g, '\\gamma'],
  [/δ/g, '\\delta'],
  [/ε/g, '\\varepsilon'],
  [/ζ/g, '\\zeta'],
  [/η/g, '\\eta'],
  [/θ/g, '\\theta'],
  [/ι/g, '\\iota'],
  [/κ/g, '\\kappa'],
  [/λ/g, '\\lambda'],
  [/μ/g, '\\mu'],
  [/ν/g, '\\nu'],
  [/ξ/g, '\\xi'],
  [/π/g, '\\pi'],
  [/ρ/g, '\\rho'],
  [/σ/g, '\\sigma'],
  [/τ/g, '\\tau'],
  [/υ/g, '\\upsilon'],
  [/φ/g, '\\varphi'],
  [/χ/g, '\\chi'],
  [/ψ/g, '\\psi'],
  [/ω/g, '\\omega'],

  // Greek letters (uppercase)
  [/Γ/g, '\\Gamma'],
  [/Δ/g, '\\Delta'],
  [/Θ/g, '\\Theta'],
  [/Λ/g, '\\Lambda'],
  [/Ξ/g, '\\Xi'],
  [/Π/g, '\\Pi'],
  [/Σ/g, '\\Sigma'],
  [/Φ/g, '\\Phi'],
  [/Ψ/g, '\\Psi'],
  [/Ω/g, '\\Omega'],

  // Special math symbols
  [/∞/g, '\\infty'],
  [/∂/g, '\\partial'],
  [/∇/g, '\\nabla'],
  [/∈/g, '\\in'],
  [/∉/g, '\\notin'],
  [/⊂/g, '\\subset'],
  [/⊃/g, '\\supset'],
  [/⊆/g, '\\subseteq'],
  [/⊇/g, '\\supseteq'],
  [/∪/g, '\\cup'],
  [/∩/g, '\\cap'],
  [/∅/g, '\\emptyset'],
  [/∀/g, '\\forall'],
  [/∃/g, '\\exists'],
  [/¬/g, '\\neg'],
  [/∧/g, '\\land'],
  [/∨/g, '\\lor'],

  // Big operators
  [/∑/g, '\\sum'],
  [/∏/g, '\\prod'],
  [/∫/g, '\\int'],

  // Fractions and roots (Unicode special chars)
  [/½/g, '\\frac{1}{2}'],
  [/⅓/g, '\\frac{1}{3}'],
  [/⅔/g, '\\frac{2}{3}'],
  [/¼/g, '\\frac{1}{4}'],
  [/¾/g, '\\frac{3}{4}'],
  [/⅕/g, '\\frac{1}{5}'],
  [/⅖/g, '\\frac{2}{5}'],
  [/⅗/g, '\\frac{3}{5}'],
  [/⅘/g, '\\frac{4}{5}'],
  [/⅙/g, '\\frac{1}{6}'],
  [/⅚/g, '\\frac{5}{6}'],
  [/⅛/g, '\\frac{1}{8}'],
  [/⅜/g, '\\frac{3}{8}'],
  [/⅝/g, '\\frac{5}{8}'],
  [/⅞/g, '\\frac{7}{8}'],
  [/√/g, '\\sqrt'],

  // Superscript digits → proper exponents
  [/²/g, '^{2}'],
  [/³/g, '^{3}'],
  [/¹/g, '^{1}'],
  [/⁰/g, '^{0}'],
  [/⁴/g, '^{4}'],
  [/⁵/g, '^{5}'],
  [/⁶/g, '^{6}'],
  [/⁷/g, '^{7}'],
  [/⁸/g, '^{8}'],
  [/⁹/g, '^{9}'],
  [/⁻/g, '^{-}'],
  [/⁺/g, '^{+}'],

  // Subscript digits
  [/₀/g, '_{0}'],
  [/₁/g, '_{1}'],
  [/₂/g, '_{2}'],
  [/₃/g, '_{3}'],
  [/₄/g, '_{4}'],
  [/₅/g, '_{5}'],
  [/₆/g, '_{6}'],
  [/₇/g, '_{7}'],
  [/₈/g, '_{8}'],
  [/₉/g, '_{9}'],

  // Misc
  [/°/g, '^{\\circ}'],
  [/′/g, "'"],
  [/″/g, "''"],
  [/‰/g, '\\permil'],
  [/∠/g, '\\angle'],
  [/⊥/g, '\\perp'],
  [/∥/g, '\\parallel'],
  [/△/g, '\\triangle'],
];

// Regex to detect if a string contains Unicode math symbols that should be LaTeX
const UNICODE_MATH_PATTERN = /[×÷±∓·≤≥≠≈≡∼→←↑↓↔⇒⇐⇔αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ∞∂∇∈∉⊂⊃⊆⊇∪∩∅∀∃¬∧∨∑∏∫½⅓⅔¼¾√²³¹⁰⁴⁵⁶⁷⁸⁹⁻⁺₀₁₂₃₄₅₆₇₈₉°′″∠⊥∥△]/;

// LaTeX command pattern (to detect if already in LaTeX)
const LATEX_CMD_PATTERN = /\\(frac|sqrt|cdot|times|div|pm|mp|neq|geq|leq|sim|approx|infty|pi|alpha|beta|gamma|vec|overline|hat|bar|sum|prod|int|lim|log|ln|sin|cos|tan|text|mathrm|mathbf|left|right|begin|end)\b/;

/**
 * Check if text contains Unicode math symbols outside of $...$ delimiters.
 */
function hasUnicodeMathOutsideDollars(text: string): boolean {
  // Remove content inside $...$ to check only the plain text parts
  const withoutMath = text.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\$[^$]*?\$/g, '');
  return UNICODE_MATH_PATTERN.test(withoutMath);
}

/**
 * Process a single segment of text (outside $...$) to convert Unicode math to LaTeX.
 * Returns the text with Unicode symbols wrapped in $...$
 */
function convertUnicodeSegment(text: string): string {
  if (!UNICODE_MATH_PATTERN.test(text)) return text;

  // Strategy: Find runs of "math-like" content (numbers, Unicode symbols, operators, variables)
  // and wrap them in $...$

  // Pattern to match math-like segments containing Unicode symbols
  // This matches sequences that include at least one Unicode math symbol
  // along with surrounding numbers, variables, parentheses, etc.
  const mathRunPattern = /(?:[\d\s\(\)\[\],.\-+=/|]|[a-zA-Z](?=[×÷±·≤≥≠≈²³¹⁰⁴⁵⁶⁷⁸⁹⁻⁺₀₁₂₃₄₅₆₇₈₉])|[×÷±∓·≤≥≠≈≡∼→←↔⇒⇐⇔αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ∞∂∇∈∉⊂⊃⊆⊇∪∩∅∀∃¬∧∨∑∏∫½⅓⅔¼¾√²³¹⁰⁴⁵⁶⁷⁸⁹⁻⁺₀₁₂₃₄₅₆₇₈₉°′″∠⊥∥△])+/g;

  let result = text;
  const matches = [...text.matchAll(mathRunPattern)];

  // Process matches in reverse order to preserve indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const segment = match[0].trim();
    if (!segment || !UNICODE_MATH_PATTERN.test(segment)) continue;

    // Convert Unicode to LaTeX within this segment
    let latex = segment;
    for (const [pattern, replacement] of UNICODE_TO_LATEX) {
      latex = latex.replace(pattern, replacement);
    }

    // Replace in result
    const start = match.index!;
    const end = start + match[0].length;
    // Preserve leading/trailing whitespace from the original match
    const leadSpace = match[0].match(/^\s*/)?.[0] || '';
    const trailSpace = match[0].match(/\s*$/)?.[0] || '';
    result = result.slice(0, start) + leadSpace + '$' + latex.trim() + '$' + trailSpace + result.slice(end);
  }

  return result;
}

/**
 * Convert LaTeX tabular content (between \begin and \end) to pipe-separated rows.
 */
function convertTabularContent(content: string): string {
  let cleaned = content;
  // Remove \hline
  cleaned = cleaned.replace(/\\hline/g, '');
  // Remove \cline{...}
  cleaned = cleaned.replace(/\\cline\s*\{[^}]*\}/g, '');
  // Convert \multicolumn{n}{spec}{text} → text
  cleaned = cleaned.replace(/\\multicolumn\{[^}]*\}\{[^}]*\}\{\s*([^}]*)\s*\}/g, '$1');

  // Split by \\ into rows
  const rows = cleaned.split(/\\\\/);
  const processedRows = rows
    .map(row => {
      const cells = row.split('&').map(cell => cell.trim()).filter(Boolean);
      if (cells.length === 0) return '';
      return cells.join(' | ');
    })
    .filter(row => row.length > 0);

  return '\n' + processedRows.join('\n') + '\n';
}

/**
 * Clean structural LaTeX that can't be rendered by MathLive.
 * Converts tabular environments to readable text, section headers to plain text,
 * and fixes currency $ patterns.
 * Applied BEFORE math processing so these don't interfere with $...$ parsing.
 */
function cleanStructuralLatex(text: string): string {
  if (!text) return text;

  // 1. Tables: If any \begin{tabular} survived to here (Phase 1.6 should have converted them
  //    to images), convert to pipe-separated text as fallback
  text = text.replace(
    /\\begin\{(?:tabular|tabularx|array|longtable)\}(?:\{[^}]*\})?\s*([\s\S]*?)\\end\{(?:tabular|tabularx|array|longtable)\}/g,
    (_, content) => convertTabularContent(content)
  );

  // 2. \section*{title} / \subsection*{title} → title
  text = text.replace(/\\(?:sub)*section\*?\{([^}]*)\}/g, '$1');

  // 3. Fix currency $\n$ NUMBER$ → \$NUMBER
  // Phase 2 breaks Chilean peso "$300.000" into "$\n$ 300000$"
  // After JSON.parse the \n becomes a real newline, so pattern is: $ + whitespace + $ + digits + $
  // Note: replacement '\\$$$1' = \\ (literal \) + $$ (literal $) + $1 (capture group)
  text = text.replace(/\$\s*\n\s*\$\s*(\d[\d.,\s]*)\$/g, '\\$$$1');

  // 3b. Fix currency $\n NUMBER$ → \$NUMBER (variant without middle $)
  // Phase 2 sometimes drops the \$ entirely, producing "$\n 7300$" in JSON
  // After JSON.parse: $ + newline + space + digits + $
  text = text.replace(/\$\s*\n\s+(\d[\d.,\s]*)\$/g, '\\$$$1');

  // 4. Fix \$ NUMBER in plain text (Mathpix's escaped dollar for currency)
  // \$ 30 is fine as stored format — frontend will render \$ as $

  return text;
}

/**
 * Post-process text from AI to fix Unicode math symbols and ensure proper LaTeX delimiters.
 * This operates on a single text field (question_text, option, etc.)
 */
export function postProcessMathText(text: string): string {
  if (!text) return text;

  // Step -3: Clean structural LaTeX (tables, sections, currency patterns)
  // Must run before all math processing so \begin{tabular}, \section*, $\n$ don't
  // interfere with $...$ delimiter parsing
  text = cleanStructuralLatex(text);

  // Step -2: Fix mis-encoded LaTeX commands where JSON escape consumed the backslash.
  // AI sometimes writes \ncdot in JSON where \n is a JSON escape → newline(0x0A) + "cdot".
  // Also handles tab+cdot, CR+cdot, etc. [\n\r\t\f\x08] = all JSON escape control chars.
  text = text.replace(/[\n\r\t\f\x08]cdot\b/g, '\\cdot');
  text = text.replace(/[\n\r\t\f\x08]cdots\b/g, '\\cdots');
  text = text.replace(/[\n\r\t\f\x08]sqrt(?=[{\s(])/g, '\\sqrt');

  // Step -2b: Fix \n% → \% (Phase 2 writes \% in JSON but \n eats the backslash)
  // After JSON.parse: newline + % — should be \% (LaTeX percent)
  // Then fixTextWrappedLatex \% → % will normalize it for display
  text = text.replace(/[\n\r\t\f\x08]%/g, '\\%');

  // Step -1: Fix literal \n (two chars: backslash + n) → actual newline
  // fixLatexInJsonString bug: sometimes double-escapes \n making it literal
  // Negative lookahead: don't replace \neq, \nabla, \nu, etc.
  text = text.replace(/\\n(?![a-zA-Z])/g, '\n');

  // Step 0: Repair control characters from JSON.parse escape destruction
  // e.g., form-feed + "rac" → \frac, tab + "imes" → \times
  text = repairBrokenLatex(text);

  // Step 0.5: Fix double-escaped percent signs (\\% → \%)
  // AI sometimes produces \\% which should be \% for proper LaTeX rendering
  text = text.replace(/\\\\%/g, '\\%');

  // Step 0.6: Fix AI-generated \text{} wrappers around LaTeX commands
  // GPT-4o sometimes wraps LaTeX commands in \text{}, e.g. \text{\sqrt}X → \sqrt{X}
  text = fixTextWrappedLatex(text);

  // Step 1: Fix bare LaTeX commands (without $ delimiters)
  // Check ALL plain-text segments (outside $...$) for bare LaTeX commands
  // Previously only ran when there were NO $ at all, which missed cases like:
  //   "Para calcular $x$, se usa 2 \cdot 3" → \cdot stayed bare
  if (LATEX_CMD_PATTERN.test(text)) {
    if (!text.includes('$')) {
      // No $ at all → wrap the whole text
      text = wrapBareLatexInDollars(text);
    } else {
      // Has some $...$ but might also have bare LaTeX outside them
      text = processTextSegments(text, (segment) => {
        if (LATEX_CMD_PATTERN.test(segment)) {
          return wrapBareLatexInDollars(segment);
        }
        return segment;
      });
    }
  }

  // Step 2: Convert Unicode math symbols INSIDE existing $...$ to LaTeX
  text = convertUnicodeInsideDollars(text);

  // Step 3: Convert Unicode math symbols OUTSIDE $...$ - wrap in $...$
  if (hasUnicodeMathOutsideDollars(text)) {
    text = processTextSegments(text, convertUnicodeSegment);
  }

  // Step 4: Re-run fixTextWrappedLatex AFTER Unicode conversion
  // Unicode → LaTeX conversion (e.g., ° → ^{\circ}) can create new \text{^{\circ}X} patterns
  text = fixTextWrappedLatex(text);

  return text;
}

/**
 * Process only the plain-text segments (outside $...$) of a string.
 */
function processTextSegments(text: string, processor: (segment: string) => string): string {
  const parts: string[] = [];
  let i = 0;
  const maxIterations = text.length * 2 + 100; // Safety: can't need more iterations than 2x text length
  let iterations = 0;

  while (i < text.length) {
    iterations++;
    if (iterations > maxIterations) {
      console.error(`  ⚠️ processTextSegments: safety limit reached (${maxIterations} iterations), returning text as-is`);
      console.error(`  ⚠️ Text (first 200 chars): ${text.substring(0, 200)}`);
      return text;
    }

    // Check for $$ (display math)
    if (text[i] === '$' && i + 1 < text.length && text[i + 1] === '$') {
      const end = text.indexOf('$$', i + 2);
      if (end !== -1) {
        parts.push(text.slice(i, end + 2));
        i = end + 2;
        continue;
      }
      // Unclosed $$ — treat as plain text and advance past it
      parts.push(processor('$$'));
      i += 2;
      continue;
    }

    // Check for $ (inline math)
    if (text[i] === '$') {
      const end = text.indexOf('$', i + 1);
      if (end !== -1) {
        parts.push(text.slice(i, end + 1));
        i = end + 1;
        continue;
      }
      // Unclosed $ — treat as plain text and advance past it
      parts.push(processor('$'));
      i += 1;
      continue;
    }

    // Find next $
    const nextDollar = text.indexOf('$', i);
    if (nextDollar === -1) {
      // Rest is plain text
      parts.push(processor(text.slice(i)));
      break;
    } else {
      // Plain text up to next $
      parts.push(processor(text.slice(i, nextDollar)));
      i = nextDollar;
    }
  }

  return parts.join('');
}

/**
 * Convert Unicode symbols that are already inside $...$ to LaTeX commands.
 */
function convertUnicodeInsideDollars(text: string): string {
  // Process $$...$$ (display math)
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, inner) => {
    let converted = inner;
    for (const [pattern, replacement] of UNICODE_TO_LATEX) {
      converted = converted.replace(pattern, replacement);
    }
    return `$$${converted}$$`;
  });

  // Process $...$ (inline math) - but not $$
  text = text.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)*?)\$(?!\$)/g, (match, inner) => {
    let converted = inner;
    for (const [pattern, replacement] of UNICODE_TO_LATEX) {
      converted = converted.replace(pattern, replacement);
    }
    return `$${converted}$`;
  });

  return text;
}

/**
 * Wrap bare LaTeX commands (without $ delimiters) in $...$
 */
function wrapBareLatexInDollars(text: string): string {
  // Pattern: find runs of text containing LaTeX commands
  // Match a LaTeX command and its surrounding math content
  // The [a-zA-Z] part uses negative lookbehind (?<![a-zA-Z]) so it only matches
  // standalone variables (x, n) not letters inside words (the "i" in "Si")
  const latexRunPattern = /(?:(?:\\(?:frac|sqrt|cdot|times|div|pm|neq|geq|leq|pi|alpha|beta|gamma|delta|theta|lambda|sigma|vec|overline|hat|bar|infty|sim|approx|left|right)\b(?:\{[^}]*\})*(?:\[[^\]]*\])*)|[\d\s\+\-=\(\)\[\]\{\},./^_]|(?<![a-zA-Z])[a-zA-Z](?=[\s]*(?:\\|[\^_])))+/g;

  return text.replace(latexRunPattern, (match) => {
    if (LATEX_CMD_PATTERN.test(match)) {
      // Preserve leading/trailing whitespace around the $...$ block
      const lead = match.match(/^\s*/)?.[0] || '';
      const trail = match.match(/\s*$/)?.[0] || '';
      return `${lead}$${match.trim()}$${trail}`;
    }
    return match;
  });
}


/**
 * Post-process an entire question object from the AI.
 * Processes question_text, options, and correction_criteria.
 */
export function postProcessQuestion(question: any): any {
  const processed = { ...question };

  // Process question text
  if (processed.text) {
    processed.text = postProcessMathText(processed.text);
  }

  // Process context
  if (processed.context) {
    processed.context = postProcessMathText(processed.context);
  }

  // Process options
  if (processed.options && Array.isArray(processed.options)) {
    processed.options = processed.options.map((opt: string) => {
      // Strip option letter prefix (e.g., "A) ", "B) ") before processing math
      // to prevent the prefix from being included in the $...$ wrapping
      const prefixMatch = opt.match(/^([A-Za-z]\)\s*)/);
      let result: string;
      if (prefixMatch) {
        const prefix = prefixMatch[1];
        const content = opt.slice(prefix.length);
        result = prefix + postProcessMathText(content);
      } else {
        result = postProcessMathText(opt);
      }
      return result;
    });
  }

  // Process correct_answer (for cases like math answers)
  if (processed.correct_answer) {
    processed.correct_answer = postProcessMathText(processed.correct_answer);
  }

  return processed;
}
