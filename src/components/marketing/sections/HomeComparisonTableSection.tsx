"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  COLUMNS,
  DISCLAIMER,
  FL_BROKER_LICENSE_FOOTER,
  HOME_COMPARISON_ROWS,
  PRIMARY_CTA,
  SECONDARY_CTA,
  SECTION_EYEBROW,
  SECTION_HEADLINE,
  SECTION_ID,
  SECTION_INTRO,
  SR_LABELS,
  type ComparisonColumnKey,
  type ComparisonRow,
  type ComparisonSymbol,
  type SymbolComparisonRowCell,
} from "@/content/home-comparison";
import { track } from "@/lib/analytics";

const SYMBOL_GLYPH: Record<ComparisonSymbol, string> = {
  check: "\u25CF",
  partial: "\u25D0",
  cross: "\u2715",
  na: "N/A",
};

function symbolColor(
  symbol: ComparisonSymbol,
  column: ComparisonColumnKey,
): string {
  if (symbol === "check") {
    return column === "buyer-v2" ? "text-primary-700" : "text-neutral-600";
  }
  if (symbol === "partial") return "text-neutral-400";
  if (symbol === "cross") return "text-neutral-400";
  return "text-neutral-400";
}

function SymbolCellContent({
  cell,
  column,
}: {
  cell: SymbolComparisonRowCell;
  column: ComparisonColumnKey;
}) {
  const glyph = SYMBOL_GLYPH[cell.symbol];
  const color = symbolColor(cell.symbol, column);
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className={`text-lg leading-none ${color}`}>
        {glyph}
      </span>
      {cell.text ? (
        <span className="text-sm text-neutral-500">{cell.text}</span>
      ) : null}
      <span className="sr-only">{SR_LABELS[cell.symbol]}</span>
    </span>
  );
}

function MoneyCellContent({
  value,
  column,
}: {
  value: string;
  column: ComparisonColumnKey;
}) {
  const isBrand = column === "buyer-v2";
  return (
    <span
      className={`text-base leading-snug ${
        isBrand
          ? "font-semibold text-primary-700"
          : "font-medium text-neutral-700"
      }`}
    >
      {value}
    </span>
  );
}

export function HomeComparisonTableSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const viewedRef = useRef(false);
  const interactedRowsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (viewedRef.current) return;
    const el = sectionRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      viewedRef.current = true;
      track("home_comparison_section_viewed", {});
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
            if (!viewedRef.current) {
              viewedRef.current = true;
              track("home_comparison_section_viewed", {});
            }
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleRowInteract = (
    row: ComparisonRow,
    surface: "desktop" | "mobile",
  ) => {
    const dedupeKey = `${surface}:${row.id}`;
    if (interactedRowsRef.current.has(dedupeKey)) return;
    interactedRowsRef.current.add(dedupeKey);
    track("home_comparison_row_interacted", {
      rowKey: row.id,
      surface,
    });
  };

  const handlePrimaryCta = () => {
    track("home_comparison_pricing_cta_clicked", {});
  };

  const handleSecondaryCta = () => {
    track("home_comparison_intake_cta_clicked", {});
  };

  return (
    <section
      ref={sectionRef}
      id={SECTION_ID}
      aria-labelledby="how-we-compare-heading"
      className="scroll-mt-[84px] w-full bg-white py-20 lg:py-28"
    >
      <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">
            {SECTION_EYEBROW}
          </p>
          <h2
            id="how-we-compare-heading"
            className="mt-3 text-balance text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]"
          >
            {SECTION_HEADLINE}
          </h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-neutral-500 md:text-lg">
            {SECTION_INTRO}
          </p>
        </header>

        {/* ── Desktop semantic table (≥1024px) ─────────────────────────── */}
        <div className="mt-14 hidden overflow-hidden rounded-[24px] border border-neutral-200/80 bg-white shadow-sm lg:block">
          <table className="hwc-table w-full border-collapse text-left">
            <caption className="sr-only">
              Comparison of buyer-v2 against a Traditional Agent and going
              Without an Agent across fees, representation, and tools.
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="w-[26%] border-b border-neutral-200 bg-white px-6 py-5 text-left align-bottom"
                >
                  <span className="sr-only">Feature</span>
                </th>
                {COLUMNS.map((col) => {
                  const isBrand = col.key === "buyer-v2";
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      className={`border-b border-neutral-200 px-6 py-5 text-left align-bottom ${
                        isBrand ? "bg-primary-50" : "bg-white"
                      }`}
                    >
                      <span
                        className={`block text-sm font-semibold uppercase tracking-[0.08em] ${
                          isBrand ? "text-primary-700" : "text-neutral-800"
                        }`}
                      >
                        {col.label}
                      </span>
                      {col.subtext ? (
                        <span className="mt-1 block text-xs normal-case text-neutral-400">
                          {col.subtext}
                        </span>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {HOME_COMPARISON_ROWS.map((row) => {
                const verticalPadding = row.type === "money" ? "py-5" : "py-3";
                return (
                  <tr
                    key={row.id}
                    className="hwc-row group"
                    onMouseEnter={() => handleRowInteract(row, "desktop")}
                  >
                    <th
                      scope="row"
                      className={`hwc-cell border-t border-neutral-100 bg-white px-6 ${verticalPadding} text-left align-middle text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500`}
                    >
                      {row.label}
                    </th>
                    {COLUMNS.map((col) => {
                      const isBrand = col.key === "buyer-v2";
                      const baseBg = isBrand ? "bg-primary-50" : "bg-white";
                      return (
                        <td
                          key={col.key}
                          className={`hwc-cell border-t border-neutral-100 px-6 ${verticalPadding} align-middle ${baseBg} ${
                            isBrand ? "hwc-brand-cell" : "hwc-neutral-cell"
                          }`}
                        >
                          {row.type === "money" ? (
                            <MoneyCellContent
                              value={row.values[col.key]}
                              column={col.key}
                            />
                          ) : (
                            <SymbolCellContent
                              cell={row.values[col.key]}
                              column={col.key}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Stacked cards (<1024px) ──────────────────────────────────── */}
        <ul className="mt-12 flex flex-col gap-5 lg:hidden" role="list">
          {HOME_COMPARISON_ROWS.map((row) => {
            const buyerCell = row.values["buyer-v2"];
            const traditionalCell = row.values.traditional;
            const withoutCell = row.values.without;
            return (
              <li key={row.id}>
                <article
                  className="rounded-[24px] border border-neutral-200/80 bg-white p-5 shadow-sm focus-within:outline-none focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2"
                  onClick={() => handleRowInteract(row, "mobile")}
                  onTouchStart={() => handleRowInteract(row, "mobile")}
                >
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                    {row.label}
                  </h3>
                  <dl className="mt-4">
                    <div className="rounded-[16px] border border-primary-100 bg-primary-50 p-4">
                      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-700">
                        buyer-v2
                      </dt>
                      <dd className="mt-2">
                        {row.type === "money" ? (
                          <span className="block text-base font-semibold leading-snug text-primary-700">
                            {(row as Extract<ComparisonRow, { type: "money" }>)
                              .values["buyer-v2"]}
                          </span>
                        ) : (
                          <SymbolCellContent
                            cell={
                              buyerCell as SymbolComparisonRowCell
                            }
                            column="buyer-v2"
                          />
                        )}
                      </dd>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-[16px] border border-neutral-200/80 bg-neutral-50 p-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                          Traditional
                        </dt>
                        <dd className="mt-1.5">
                          {row.type === "money" ? (
                            <span className="block text-sm font-medium leading-snug text-neutral-700">
                              {(row as Extract<ComparisonRow, { type: "money" }>)
                                .values.traditional}
                            </span>
                          ) : (
                            <SymbolCellContent
                              cell={
                                traditionalCell as SymbolComparisonRowCell
                              }
                              column="traditional"
                            />
                          )}
                        </dd>
                      </div>
                      <div className="rounded-[16px] border border-neutral-200/80 bg-neutral-50 p-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                          Without an Agent
                        </dt>
                        <dd className="mt-1.5">
                          {row.type === "money" ? (
                            <span className="block text-sm font-medium leading-snug text-neutral-700">
                              {(row as Extract<ComparisonRow, { type: "money" }>)
                                .values.without}
                            </span>
                          ) : (
                            <SymbolCellContent
                              cell={
                                withoutCell as SymbolComparisonRowCell
                              }
                              column="without"
                            />
                          )}
                        </dd>
                      </div>
                    </div>
                  </dl>
                </article>
              </li>
            );
          })}
        </ul>

        {/* ── Disclaimer + license ─────────────────────────────────────── */}
        <p className="mx-auto mt-10 max-w-3xl text-xs italic leading-relaxed text-neutral-400">
          {DISCLAIMER}
        </p>
        <p className="mx-auto mt-3 max-w-3xl text-xs text-neutral-400">
          {FL_BROKER_LICENSE_FOOTER}
        </p>

        {/* ── CTAs ─────────────────────────────────────────────────────── */}
        <div className="mt-10 flex flex-col items-center gap-6">
          <Link
            href={PRIMARY_CTA.href}
            onClick={handlePrimaryCta}
            className="inline-flex items-center gap-2 text-base font-semibold text-primary-700 underline decoration-primary-200 decoration-2 underline-offset-4 transition-colors hover:text-primary-800 hover:decoration-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            {PRIMARY_CTA.label}
            <span aria-hidden="true">{"\u2192"}</span>
          </Link>
          <Link
            href={SECONDARY_CTA.href}
            onClick={handleSecondaryCta}
            className="inline-flex items-center gap-2 rounded-full bg-primary-700 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            {SECONDARY_CTA.label}
            <span aria-hidden="true">{"\u2192"}</span>
          </Link>
        </div>
      </div>

      {/* Scoped row hover blends — tints differ for the brand vs neutral columns. */}
      <style>{`
        .hwc-row:hover .hwc-neutral-cell {
          background-color: rgb(250 250 250);
        }
        .hwc-row:hover .hwc-brand-cell {
          background-color: rgb(224 234 255);
        }
      `}</style>
    </section>
  );
}
