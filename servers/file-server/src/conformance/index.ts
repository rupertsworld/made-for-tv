import { defineChangesConformance } from "./changes.ts";
import { defineConfinementConformance } from "./confinement.ts";
import { defineCorsConformance } from "./cors.ts";
import { defineDirectoriesConformance } from "./directories.ts";
import { defineEditingConformance } from "./editing.ts";
import { defineErrorsConformance } from "./errors.ts";
import { defineReadingConformance } from "./reading.ts";
import type { FileServerConformanceFactory } from "./types.js";
import { defineUrlMappingConformance } from "./url-mapping.ts";
import { defineWritingConformance } from "./writing.ts";

export type {
  FileServerConformanceFactory,
  FileServerConformanceOptions,
  FileServerConformanceServer,
} from "./types.js";

/** Registers the base wire-contract suite against a started-server factory. */
export function defineFileServerConformance(factory: FileServerConformanceFactory): void {
  defineUrlMappingConformance(factory);
  defineReadingConformance(factory);
  defineDirectoriesConformance(factory);
  defineWritingConformance(factory);
  defineEditingConformance(factory);
  defineConfinementConformance(factory);
  defineErrorsConformance(factory);
  defineCorsConformance(factory);
  defineChangesConformance(factory);
}
