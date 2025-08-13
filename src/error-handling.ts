export interface ConversionResult<T> {
  status: "success" | "partial" | "failure";
  data?: T;
  issues: ConversionIssue[];
}

export interface ConversionIssue {
  severity: "critical" | "error" | "warning";
  message: string;
  context?: {
    itemType?: "card" | "note" | "review" | "deck";
    originalData?: unknown;
  };
}

export interface ConversionOptions {
  errorHandling: "strict" | "best-effort";
}

export class IssueCollector {
  private issues: ConversionIssue[] = [];
  private options: ConversionOptions;

  constructor(options: ConversionOptions = { errorHandling: "best-effort" }) {
    this.options = options;
  }

  addIssue(issue: ConversionIssue): void {
    this.issues.push(issue);
  }

  addIssues(issues: ConversionIssue[]): void {
    this.issues.push(...issues);
  }

  addError(message: string, context?: ConversionIssue["context"]): void {
    const issue: ConversionIssue = {
      severity: "error",
      message,
    };
    if (context !== undefined) {
      issue.context = context;
    }
    this.addIssue(issue);
  }

  addWarning(message: string, context?: ConversionIssue["context"]): void {
    const issue: ConversionIssue = {
      severity: "warning",
      message,
    };
    if (context !== undefined) {
      issue.context = context;
    }
    this.addIssue(issue);
  }

  addCritical(message: string, context?: ConversionIssue["context"]): void {
    const issue: ConversionIssue = {
      severity: "critical",
      message,
    };
    if (context !== undefined) {
      issue.context = context;
    }
    this.addIssue(issue);
  }

  addCardError(message: string, card: unknown): void {
    this.addError(message, {
      itemType: "card",
      originalData: card,
    });
  }

  addNoteError(message: string, note: unknown): void {
    this.addError(message, {
      itemType: "note",
      originalData: note,
    });
  }

  addReviewError(message: string, review: unknown): void {
    this.addError(message, {
      itemType: "review",
      originalData: review,
    });
  }

  getIssues(): ConversionIssue[] {
    return [...this.issues];
  }

  hasCriticalIssues(): boolean {
    return this.issues.some((issue) => issue.severity === "critical");
  }

  hasRecoverableErrors(): boolean {
    return this.issues.some((issue) => issue.severity === "error");
  }

  createResult<T>(data: T): ConversionResult<T> {
    const issues = this.getIssues();

    if (this.hasCriticalIssues()) {
      return { status: "failure", issues };
    }

    if (this.hasRecoverableErrors()) {
      if (this.options.errorHandling === "strict") {
        return { status: "failure", issues };
      }
      return { status: "partial", data, issues };
    }

    return { status: "success", data, issues };
  }

  createFailureResult<T>(): ConversionResult<T> {
    const issues = this.getIssues();
    return { status: "failure", issues };
  }
}
