// Type declaration for the deep import we use to skip pdf-parse's debug
// branch (the top-level index.js tries to read a sample PDF off disk when
// loaded outside `npm test`). @types/pdf-parse only covers the package
// root, so we mirror its signature for the inner module.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  }
  function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>
  ): Promise<PDFParseResult>;
  export default pdfParse;
}
