import { describe, expect, it } from "vitest";

import { IssueCollector } from "./error-handling";

describe("Error Handling", () => {
  describe("IssueCollector", () => {
    it("should collect issues correctly", () => {
      const collector = new IssueCollector();

      collector.addError("Test error message");
      collector.addWarning("Test warning message");
      collector.addCritical("Test critical message");

      const issues = collector.getIssues();
      expect(issues).toHaveLength(3);
      expect(issues[0]?.severity).toBe("error");
      expect(issues[1]?.severity).toBe("warning");
      expect(issues[2]?.severity).toBe("critical");
    });

    it("should create correct result status for best-effort mode", () => {
      const collector = new IssueCollector({ errorHandling: "best-effort" });
      collector.addError("Some error");

      const result = collector.createResult("test data");

      expect(result.status).toBe("partial");
      expect(result.data).toBe("test data");
      expect(result.issues).toHaveLength(1);
    });

    it("should create correct result status for strict mode", () => {
      const collector = new IssueCollector({ errorHandling: "strict" });
      collector.addError("Some error");

      const result = collector.createResult("test data");

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues).toHaveLength(1);
    });

    it("should handle success case", () => {
      const collector = new IssueCollector();

      const result = collector.createResult("test data");

      expect(result.status).toBe("success");
      expect(result.data).toBe("test data");
      expect(result.issues).toHaveLength(0);
    });

    it("should handle critical errors correctly", () => {
      const collector = new IssueCollector({ errorHandling: "best-effort" });
      collector.addCritical("Critical error");

      const result = collector.createResult("test data");

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues).toHaveLength(1);
    });

    it("should create failure result without data", () => {
      const collector = new IssueCollector();
      collector.addError("Some error");
      collector.addCritical("Critical error");

      const result = collector.createFailureResult<string>();

      expect(result.status).toBe("failure");
      expect(result.data).toBeUndefined();
      expect(result.issues).toHaveLength(2);
    });
  });
});
