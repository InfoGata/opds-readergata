import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { h } from "preact";
import App from "../App";

// Mock nanoid to return predictable IDs
vi.mock("nanoid", () => ({
  nanoid: () => "test-id-123",
}));

// Mock lucide-react to avoid SVG rendering issues in jsdom
vi.mock("lucide-react", () => ({
  ChevronDown: () => null,
  X: () => null,
  Pencil: () => null,
}));

// Mock Radix accordion to avoid jsdom QName errors
vi.mock("../components/ui/accordion", () => ({
  Accordion: ({ children }: any) => h("div", { "data-testid": "accordion" }, children),
  AccordionItem: ({ children }: any) => h("div", null, children),
  AccordionTrigger: ({ children }: any) => h("button", null, children),
  AccordionContent: ({ children }: any) => h("div", null, children),
}));

describe("App", () => {
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postMessageSpy = vi.fn();
    vi.spyOn(window.parent, "postMessage").mockImplementation(postMessageSpy as any);
  });

  it("renders Add Catalog accordion", () => {
    render(<App />);
    expect(screen.getByText("Add Catalog")).toBeTruthy();
  });

  it("Add button is disabled when title is empty", () => {
    render(<App />);
    const addButton = screen.getByRole("button", { name: "Add" });
    expect(addButton).toBeDisabled();
  });

  it("sends get-catalogs message on mount", () => {
    render(<App />);
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: "get-catalogs" },
      "*"
    );
  });

  it("receives catalogs via postMessage and renders them", async () => {
    render(<App />);

    // Simulate parent sending catalogs back
    const catalogsMessage = {
      data: {
        type: "get-catalogs",
        catalogs: [
          { id: "1", name: "Test Catalog", apiId: "http://test.com/opds" },
        ],
      },
    };
    fireEvent(window, new MessageEvent("message", catalogsMessage));

    expect(screen.getByText("Test Catalog")).toBeTruthy();
    expect(screen.getByText("http://test.com/opds")).toBeTruthy();
  });
});
