type MockRow = Record<string, unknown> & {
  _id: string;
  _creationTime?: number;
};

type MockTables = Record<string, MockRow[]>;

type EqFilter = {
  field: string;
  value: unknown;
};

function cloneTables(initialTables: Partial<MockTables>): MockTables {
  return Object.fromEntries(
    Object.entries(initialTables).map(([table, rows]) => [
      table,
      structuredClone(rows ?? []),
    ]),
  );
}

function applyFilters(rows: MockRow[], filters: EqFilter[]): MockRow[] {
  return rows.filter((row) =>
    filters.every((filter) => row[filter.field] === filter.value),
  );
}

function seedIdCounters(tables: MockTables) {
  return new Map(
    Object.entries(tables)
      .map(([table, rows]) => {
        const maxId = rows.reduce((currentMax, row) => {
          const match = row._id.match(new RegExp(`^${table}:(\\d+)$`));
          if (!match) {
            return currentMax;
          }
          return Math.max(currentMax, Number(match[1]));
        }, 0);

        return [table, maxId] as const;
      })
      .filter(([, maxId]) => maxId > 0),
  );
}

function makeQuery(rows: MockRow[]) {
  return {
    withIndex(
      _indexName: string,
      apply: (q: { eq(field: string, value: unknown): unknown }) => unknown,
    ) {
      const filters: EqFilter[] = [];
      const chain = {
        eq(field: string, value: unknown) {
          filters.push({ field, value });
          return chain;
        },
      };
      apply(chain);
      return makeQuery(applyFilters(rows, filters));
    },
    async collect() {
      return rows.slice();
    },
    async first() {
      return rows[0] ?? null;
    },
    async unique() {
      if (rows.length > 1) {
        throw new Error("Mock query expected at most one row");
      }
      return rows[0] ?? null;
    },
  };
}

export function createMockDb(initialTables: Partial<MockTables> = {}) {
  const tables = cloneTables(initialTables);
  const idCounters = seedIdCounters(tables);

  function nextId(table: string) {
    const next = (idCounters.get(table) ?? 0) + 1;
    idCounters.set(table, next);
    return `${table}:${next}`;
  }

  const db = {
    query(table: string) {
      return makeQuery(tables[table] ?? []);
    },
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const match = rows.find((row) => row._id === id);
        if (match) return match;
      }
      return null;
    },
    async insert(table: string, value: Record<string, unknown>) {
      const row: MockRow = {
        _id: nextId(table),
        _creationTime: Date.now(),
        ...structuredClone(value),
      };
      tables[table] ??= [];
      tables[table].push(row);
      return row._id;
    },
    async patch(id: string, value: Record<string, unknown>) {
      for (const rows of Object.values(tables)) {
        const row = rows.find((candidate) => candidate._id === id);
        if (!row) continue;
        Object.assign(row, structuredClone(value));
        return;
      }
      throw new Error(`Mock row not found: ${id}`);
    },
  };

  return {
    db,
    getTable(table: string) {
      return tables[table] ?? [];
    },
  };
}
