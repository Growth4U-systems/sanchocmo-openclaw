/**
 * Parser and evaluator for dashboard custom-metric formulas.
 *
 * Deliberately has no runtime dependencies so it is safe to import from both
 * the API/MCP layer and the browser. Formulas are parsed into a tiny AST; they
 * are never passed to `eval`, `Function`, or a JavaScript expression parser.
 */

export type MetricFormulaBinaryOperator = "+" | "-" | "*" | "/" | "%";
export type MetricFormulaUnaryOperator = "+" | "-";

export type MetricFormulaNode =
  | { type: "number"; value: number }
  | { type: "reference"; source: string; metric: string; raw: string }
  | { type: "unary"; operator: MetricFormulaUnaryOperator; operand: MetricFormulaNode }
  | {
      type: "binary";
      operator: MetricFormulaBinaryOperator;
      left: MetricFormulaNode;
      right: MetricFormulaNode;
    };

export interface MetricFormulaReference {
  source: string;
  metric: string;
  raw: string;
}

export type MetricFormulaErrorCode =
  | "empty_formula"
  | "formula_too_long"
  | "invalid_character"
  | "invalid_number"
  | "invalid_reference"
  | "unexpected_token"
  | "unexpected_end"
  | "too_complex";

export interface MetricFormulaError {
  code: MetricFormulaErrorCode;
  message: string;
  offset: number;
}

export type MetricFormulaParseResult =
  | { ok: true; ast: MetricFormulaNode; references: MetricFormulaReference[] }
  | { ok: false; error: MetricFormulaError };

export type MetricFormulaEvaluationErrorCode =
  | "missing_reference"
  | "division_by_zero"
  | "non_finite_result";

export type MetricFormulaEvaluationResult =
  | { ok: true; value: number }
  | {
      ok: false;
      value: null;
      error: {
        code: MetricFormulaEvaluationErrorCode;
        message: string;
        reference?: MetricFormulaReference;
      };
    };

type Token =
  | { type: "number"; value: number; offset: number }
  | { type: "reference"; reference: MetricFormulaReference; offset: number }
  | { type: "operator"; value: MetricFormulaBinaryOperator; offset: number }
  | { type: "left_paren"; offset: number }
  | { type: "right_paren"; offset: number }
  | { type: "eof"; offset: number };

const MAX_FORMULA_LENGTH = 500;
const MAX_TOKENS = 256;
const MAX_AST_DEPTH = 64;
const IDENTIFIER_START_RE = /[A-Za-z_]/;
const IDENTIFIER_CONTINUE_RE = /[A-Za-z0-9_]/;

class FormulaSyntaxError extends Error {
  constructor(
    readonly code: MetricFormulaErrorCode,
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  const push = (token: Token) => {
    tokens.push(token);
    if (tokens.length > MAX_TOKENS) {
      throw new FormulaSyntaxError(
        "too_complex",
        `Formula exceeds the ${MAX_TOKENS}-token limit`,
        token.offset,
      );
    }
  };

  const readIdentifier = (allowHyphen: boolean): string => {
    const start = index;
    if (!IDENTIFIER_START_RE.test(formula[index] ?? "")) return "";
    index += 1;
    while (index < formula.length) {
      if (IDENTIFIER_CONTINUE_RE.test(formula[index])) {
        index += 1;
        continue;
      }
      if (
        allowHyphen &&
        formula[index] === "-" &&
        IDENTIFIER_CONTINUE_RE.test(formula[index + 1] ?? "")
      ) {
        index += 1;
        continue;
      }
      break;
    }
    return formula.slice(start, index);
  };

  while (index < formula.length) {
    const char = formula[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const offset = index;
    if (char === "(" || char === ")") {
      push({ type: char === "(" ? "left_paren" : "right_paren", offset });
      index += 1;
      continue;
    }
    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "%") {
      push({ type: "operator", value: char, offset });
      index += 1;
      continue;
    }

    if (/\d/.test(char) || (char === "." && /\d/.test(formula[index + 1] ?? ""))) {
      const match = formula.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (!match) {
        throw new FormulaSyntaxError("invalid_number", "Invalid numeric literal", offset);
      }
      index += match[0].length;
      const value = Number(match[0]);
      if (!Number.isFinite(value)) {
        throw new FormulaSyntaxError("invalid_number", "Numeric literal must be finite", offset);
      }
      push({ type: "number", value, offset });
      continue;
    }

    if (IDENTIFIER_START_RE.test(char)) {
      const source = readIdentifier(true);
      if (formula[index] !== ".") {
        throw new FormulaSyntaxError(
          "invalid_reference",
          `Expected a source.metric reference after “${source}”`,
          offset,
        );
      }
      index += 1;
      const metricOffset = index;
      const metric = readIdentifier(false);
      if (!metric) {
        throw new FormulaSyntaxError(
          "invalid_reference",
          "Metric reference is missing the metric name after the dot",
          metricOffset,
        );
      }
      const raw = `${source}.${metric}`;
      push({
        type: "reference",
        reference: { source, metric, raw },
        offset,
      });
      continue;
    }

    throw new FormulaSyntaxError(
      "invalid_character",
      `Character “${char}” is not allowed in a metric formula`,
      offset,
    );
  }

  tokens.push({ type: "eof", offset: formula.length });
  return tokens;
}

class FormulaParser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): MetricFormulaNode {
    const expression = this.parseAdditive(0);
    const trailing = this.peek();
    if (trailing.type !== "eof") {
      throw new FormulaSyntaxError(
        "unexpected_token",
        "Unexpected token after the end of the expression",
        trailing.offset,
      );
    }
    return expression;
  }

  private parseAdditive(depth: number): MetricFormulaNode {
    let node = this.parseMultiplicative(depth + 1);
    while (this.isOperator("+") || this.isOperator("-")) {
      const operator = (this.take() as Extract<Token, { type: "operator" }>).value;
      node = { type: "binary", operator, left: node, right: this.parseMultiplicative(depth + 1) };
    }
    return node;
  }

  private parseMultiplicative(depth: number): MetricFormulaNode {
    let node = this.parseUnary(depth + 1);
    while (this.isOperator("*") || this.isOperator("/") || this.isOperator("%")) {
      const operator = (this.take() as Extract<Token, { type: "operator" }>).value;
      node = { type: "binary", operator, left: node, right: this.parseUnary(depth + 1) };
    }
    return node;
  }

  private parseUnary(depth: number): MetricFormulaNode {
    this.assertDepth(depth);
    if (this.isOperator("+") || this.isOperator("-")) {
      const operator = (this.take() as Extract<Token, { type: "operator" }>).value as MetricFormulaUnaryOperator;
      return { type: "unary", operator, operand: this.parseUnary(depth + 1) };
    }
    return this.parsePrimary(depth + 1);
  }

  private parsePrimary(depth: number): MetricFormulaNode {
    this.assertDepth(depth);
    const token = this.take();
    if (token.type === "number") return { type: "number", value: token.value };
    if (token.type === "reference") return { type: "reference", ...token.reference };
    if (token.type === "left_paren") {
      const expression = this.parseAdditive(depth + 1);
      const closing = this.take();
      if (closing.type !== "right_paren") {
        throw new FormulaSyntaxError(
          closing.type === "eof" ? "unexpected_end" : "unexpected_token",
          "Expected a closing parenthesis",
          closing.offset,
        );
      }
      return expression;
    }
    if (token.type === "eof") {
      throw new FormulaSyntaxError("unexpected_end", "Formula ends before the expression is complete", token.offset);
    }
    throw new FormulaSyntaxError("unexpected_token", "Expected a number, source.metric reference, or parenthesis", token.offset);
  }

  private assertDepth(depth: number): void {
    if (depth > MAX_AST_DEPTH) {
      throw new FormulaSyntaxError("too_complex", `Formula exceeds the maximum nesting depth of ${MAX_AST_DEPTH}`, this.peek().offset);
    }
  }

  private peek(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1];
  }

  private take(): Token {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  private isOperator(operator: MetricFormulaBinaryOperator): boolean {
    const token = this.peek();
    return token.type === "operator" && token.value === operator;
  }
}

function uniqueReferences(ast: MetricFormulaNode): MetricFormulaReference[] {
  const refs = new Map<string, MetricFormulaReference>();
  const visit = (node: MetricFormulaNode): void => {
    if (node.type === "reference") {
      refs.set(node.raw, { source: node.source, metric: node.metric, raw: node.raw });
      return;
    }
    if (node.type === "unary") visit(node.operand);
    if (node.type === "binary") {
      visit(node.left);
      visit(node.right);
    }
  };
  visit(ast);
  return [...refs.values()];
}

export function parseMetricFormula(formula: string): MetricFormulaParseResult {
  if (typeof formula !== "string" || !formula.trim()) {
    return {
      ok: false,
      error: { code: "empty_formula", message: "Formula cannot be empty", offset: 0 },
    };
  }
  if (formula.length > MAX_FORMULA_LENGTH) {
    return {
      ok: false,
      error: {
        code: "formula_too_long",
        message: `Formula exceeds the ${MAX_FORMULA_LENGTH}-character limit`,
        offset: MAX_FORMULA_LENGTH,
      },
    };
  }

  try {
    const ast = new FormulaParser(tokenize(formula)).parse();
    return { ok: true, ast, references: uniqueReferences(ast) };
  } catch (error) {
    if (error instanceof FormulaSyntaxError) {
      return {
        ok: false,
        error: { code: error.code, message: error.message, offset: error.offset },
      };
    }
    return {
      ok: false,
      error: { code: "unexpected_token", message: "Formula could not be parsed", offset: 0 },
    };
  }
}

export function formulaValidationMessage(formula: string): string | null {
  const parsed = parseMetricFormula(formula);
  if (!parsed.ok) {
    return `${parsed.error.message} (at character ${parsed.error.offset + 1})`;
  }
  return parsed.references.length
    ? null
    : "Formula must include at least one source.metric reference";
}

export function isSafeFormula(formula: string): boolean {
  return formulaValidationMessage(formula) === null;
}

export function evaluateMetricFormula(
  ast: MetricFormulaNode,
  resolveReference: (reference: MetricFormulaReference) => number | null | undefined,
): MetricFormulaEvaluationResult {
  const evaluate = (node: MetricFormulaNode): MetricFormulaEvaluationResult => {
    if (node.type === "number") return { ok: true, value: node.value };
    if (node.type === "reference") {
      const reference = { source: node.source, metric: node.metric, raw: node.raw };
      const value = resolveReference(reference);
      if (value == null || !Number.isFinite(value)) {
        return {
          ok: false,
          value: null,
          error: {
            code: "missing_reference",
            message: `No usable value is available for ${node.raw}`,
            reference,
          },
        };
      }
      return { ok: true, value };
    }
    if (node.type === "unary") {
      const operand = evaluate(node.operand);
      if (!operand.ok) return operand;
      const value = node.operator === "-" ? -operand.value : operand.value;
      return Number.isFinite(value)
        ? { ok: true, value }
        : { ok: false, value: null, error: { code: "non_finite_result", message: "Formula result is not finite" } };
    }

    const left = evaluate(node.left);
    if (!left.ok) return left;
    const right = evaluate(node.right);
    if (!right.ok) return right;
    if ((node.operator === "/" || node.operator === "%") && right.value === 0) {
      return {
        ok: false,
        value: null,
        error: { code: "division_by_zero", message: "Formula divides by zero" },
      };
    }

    let value: number;
    switch (node.operator) {
      case "+": value = left.value + right.value; break;
      case "-": value = left.value - right.value; break;
      case "*": value = left.value * right.value; break;
      case "/": value = left.value / right.value; break;
      case "%": value = left.value % right.value; break;
    }
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, value: null, error: { code: "non_finite_result", message: "Formula result is not finite" } };
  };

  return evaluate(ast);
}
