export interface FileServerConformanceServer {
  readonly baseUrl: string;
  close(): void | Promise<void>;
}

export interface FileServerConformanceOptions {
  readonly pingIntervalMs?: number;
}

export type FileServerConformanceFactory = (
  root: string,
  options?: FileServerConformanceOptions,
) => FileServerConformanceServer | Promise<FileServerConformanceServer>;
