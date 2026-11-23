import { describe, it, expect } from "vitest";
import { resetLink } from "@/lib/mail";

describe("password reset link", () => {
  it("uses the configured app URL and escapes the token", () => {
    const original = process.env.APP_URL;
    process.env.APP_URL = "https://app.example.com/";
    try {
      expect(resetLink("a+b/c")).toBe("https://app.example.com/reset-password?token=a%2Bb%2Fc");
    } finally {
      if (original === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = original;
    }
  });
});
