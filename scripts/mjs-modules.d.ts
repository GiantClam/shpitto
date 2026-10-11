declare module '*.mjs' {
  export function validateVendorDocs(args: {
    manifest: {
      version: string;
      source: string;
      navigation: Array<{title: string; path: string}>;
      search?: {mode: string; source: string};
    };
    navigation: {
      release: string;
      source: string;
      search: {mode: string; source: string};
      pages: Array<{title: string; path: string}>;
    };
    sourceConfig: string;
    exists?: (file: string) => boolean;
    read?: (file: string) => string;
  }): string[];
}
