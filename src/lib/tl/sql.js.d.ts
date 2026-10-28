declare module "sql.js" {
  export type SqlValue = string | number | Uint8Array | null;
  export interface Statement {
    bind(values?: SqlValue[]): boolean;
    step(): boolean;
    get(): SqlValue[];
    free(): boolean;
  }
  export interface Database {
    run(sql: string, params?: SqlValue[]): Database;
    exec(sql: string): { columns: string[]; values: SqlValue[][] }[];
    prepare(sql: string): Statement;
    close(): void;
  }
  interface SqlJs {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }
  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJs>;
}

declare module "*.wasm?url" {
  const src: string;
  export default src;
}
