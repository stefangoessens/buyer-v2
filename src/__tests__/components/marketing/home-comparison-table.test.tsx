// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}));

class MockIntersectionObserver {
  observe = () => {};
  disconnect = () => {};
  unobserve = () => {};
  takeRecords = () => [] as IntersectionObserverEntry[];
  root = null;
  rootMargin = "";
  thresholds: ReadonlyArray<number> = [];
}

beforeAll(() => {
  (
    globalThis as unknown as { IntersectionObserver: typeof MockIntersectionObserver }
  ).IntersectionObserver = MockIntersectionObserver;
});

afterEach(() => {
  cleanup();
});

import { HomeComparisonTableSection } from "@/components/marketing/sections/HomeComparisonTableSection";
import {
  COLUMNS,
  HOME_COMPARISON_ROWS,
} from "@/content/home-comparison";

function renderSection() {
  return render(<HomeComparisonTableSection />);
}

function getDesktopTable(container: HTMLElement): HTMLTableElement {
  const table = container.querySelector("table");
  if (!table) throw new Error("Expected desktop <table> in section");
  return table as HTMLTableElement;
}

describe("HomeComparisonTableSection — canonical semantic table", () => {
  it("renders a <table> with caption, thead, and tbody", () => {
    const { container } = renderSection();
    const table = getDesktopTable(container);

    expect(table).toBeInTheDocument();

    const caption = table.querySelector("caption");
    expect(caption).not.toBeNull();
    expect(caption).toHaveClass("sr-only");
    expect(caption?.textContent).toMatch(/buyer-v2/i);
    expect(caption?.textContent).toMatch(/Traditional Agent/i);
    expect(caption?.textContent).toMatch(/Without an Agent/i);

    expect(table.querySelector("thead")).not.toBeNull();
    expect(table.querySelector("tbody")).not.toBeNull();
  });

  it("exposes one <th scope='col'> per column with the labels from COLUMNS", () => {
    const { container } = renderSection();
    const table = getDesktopTable(container);

    const colHeaders = Array.from(
      table.querySelectorAll('thead th[scope="col"]'),
    ) as HTMLTableCellElement[];

    // Leftmost header is the sr-only "Feature" column — exclude it from the
    // column-label match per the test contract.
    expect(colHeaders.length).toBe(COLUMNS.length + 1);
    const featureHeader = colHeaders[0];
    expect(featureHeader.textContent?.toLowerCase()).toContain("feature");

    const dataHeaders = colHeaders.slice(1);
    for (const col of COLUMNS) {
      const match = dataHeaders.find((h) =>
        (h.textContent ?? "").toLowerCase().includes(col.label.toLowerCase()),
      );
      expect(match, `Expected a column header matching ${col.label}`).toBeTruthy();
    }
  });

  it("renders one <th scope='row'> per HOME_COMPARISON_ROWS entry with its label", () => {
    const { container } = renderSection();
    const table = getDesktopTable(container);

    const rowHeaders = Array.from(
      table.querySelectorAll('tbody th[scope="row"]'),
    ) as HTMLTableCellElement[];

    expect(rowHeaders).toHaveLength(HOME_COMPARISON_ROWS.length);
    for (const row of HOME_COMPARISON_ROWS) {
      const match = rowHeaders.find((h) =>
        (h.textContent ?? "").includes(row.label),
      );
      expect(match, `Expected a row header for ${row.label}`).toBeTruthy();
    }
  });

  it("renders a <td> for every (row x non-label column) cell in the desktop table", () => {
    const { container } = renderSection();
    const table = getDesktopTable(container);

    const tds = table.querySelectorAll("tbody td");
    expect(tds.length).toBe(HOME_COMPARISON_ROWS.length * COLUMNS.length);
  });
});

describe("HomeComparisonTableSection — symbol sr-only equivalents", () => {
  it("includes sr-only spans for Included, Partial, Not included, and Not applicable", () => {
    const { container } = renderSection();
    const srOnlySpans = Array.from(
      container.querySelectorAll("span.sr-only"),
    ) as HTMLSpanElement[];
    const texts = srOnlySpans.map((s) => s.textContent?.trim() ?? "");

    for (const required of [
      "Included",
      "Partial",
      "Not included",
      "Not applicable",
    ]) {
      expect(
        texts.includes(required),
        `Expected at least one span.sr-only with text "${required}"`,
      ).toBe(true);
    }
  });
});

describe("HomeComparisonTableSection — column header subtext", () => {
  it("renders the '3% commission' and 'DIY / unrepresented' header subtext", () => {
    const { container } = renderSection();
    const table = getDesktopTable(container);
    const headText = table.querySelector("thead")?.textContent ?? "";

    expect(headText).toContain("3% commission");
    expect(headText).toContain("DIY / unrepresented");
  });
});

describe("HomeComparisonTableSection — Flat-fee alignment N/A cell", () => {
  it("renders an N/A glyph and a 'Not applicable' sr-only span in the Without column", () => {
    const { container } = renderSection();
    const table = getDesktopTable(container);

    const flatFeeRow = Array.from(table.querySelectorAll("tbody tr")).find(
      (tr) => tr.querySelector('th[scope="row"]')?.textContent?.includes(
        "Flat-fee alignment",
      ),
    );
    expect(flatFeeRow, "Expected a Flat-fee alignment row").toBeTruthy();

    const cells = (flatFeeRow as HTMLTableRowElement).querySelectorAll("td");
    expect(cells.length).toBe(COLUMNS.length);
    // COLUMNS order: buyer-v2, traditional, without — without is index 2.
    const withoutCell = cells[2] as HTMLTableCellElement;

    expect(withoutCell.textContent).toContain("N/A");
    const srOnly = withoutCell.querySelector("span.sr-only");
    expect(srOnly).not.toBeNull();
    expect(srOnly?.textContent?.trim()).toBe("Not applicable");
  });
});
