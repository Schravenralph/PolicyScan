import express from 'express';
declare const router: import("express-serve-static-core").Router;
/**
 * ⚠️ **DEPRECATED** - Legacy API Routes
 *
 * These routes are deprecated and will be removed in a future version.
 * Please migrate to the canonical document API:
 * - Use `/api/canonical-documents` instead of `/api/brondocumenten`
 * - See WI-415: Backend Cleanup & Transformation Removal
 *
 * @deprecated Use `/api/canonical-documents` instead
 * @see src/server/routes/canonical-documents.ts
 */
export declare function createBrondocumentenRouter(): express.Router;
export default router;
