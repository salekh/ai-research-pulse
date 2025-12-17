declare module 'better-sqlite3' {
  interface Database {
    prepare(sql: string): Statement;
    transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
    exec(sql: string): this;
    close(): this;
  }

  interface Statement {
    run(...params: any[]): RunResult;
    get(...params: any[]): any;
    all(...params: any[]): any[];
    iterate(...params: any[]): IterableIterator<any>;
  }

  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Options {
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    verbose?: (message?: any, ...additionalArgs: any[]) => void;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: Options): Database;
    (filename: string, options?: Options): Database;
  }

  const Database: DatabaseConstructor;
  export = Database;
}

declare module 'node-fetch' {
  export default function fetch(url: string | Request, init?: RequestInit): Promise<Response>;
}
