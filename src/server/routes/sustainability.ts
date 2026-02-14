import { Router, Request, Response } from 'express';
import { sustainabilityMetricsService } from '../services/sustainability/SustainabilityMetricsService.js';
import { reportGenerator } from '../services/sustainability/ReportGenerator.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError } from '../types/errors.js';

export function createSustainabilityRoutes(): Router {
  const router = Router();

  /**
   * GET /api/sustainability/metrics
   * Get sustainability metrics for a time period
   */
  router.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    // Validate date range
    if (isNaN(startDate.getTime())) {
      throw new BadRequestError('Invalid startDate format');
    }
    if (isNaN(endDate.getTime())) {
      throw new BadRequestError('Invalid endDate format');
    }
    if (startDate > endDate) {
      throw new BadRequestError('startDate must be before endDate');
    }

    const filters: {
      provider?: string;
      model?: string;
      operation?: string;
    } = {};

    if (req.query.provider) {
      filters.provider = req.query.provider as string;
    }
    if (req.query.model) {
      filters.model = req.query.model as string;
    }
    if (req.query.operation) {
      filters.operation = req.query.operation as string;
    }

    const metrics = await sustainabilityMetricsService.getMetrics(startDate, endDate, filters);
    res.json(metrics);
  }));

  /**
   * GET /api/sustainability/kpis
   * Get sustainability KPIs
   */
  router.get('/kpis', asyncHandler(async (req: Request, res: Response) => {
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    const baselineStartDate = req.query.baselineStartDate
      ? new Date(req.query.baselineStartDate as string)
      : undefined;
    const baselineEndDate = req.query.baselineEndDate
      ? new Date(req.query.baselineEndDate as string)
      : undefined;

    const kpis = await sustainabilityMetricsService.getKPIs(
      startDate,
      endDate,
      baselineStartDate,
      baselineEndDate
    );
    res.json(kpis);
  }));

  /**
   * GET /api/sustainability/baseline-comparison
   * Compare current metrics with baseline period
   */
  router.get('/baseline-comparison', asyncHandler(async (req: Request, res: Response) => {
    const currentStartDate = req.query.currentStartDate
      ? new Date(req.query.currentStartDate as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const currentEndDate = req.query.currentEndDate
      ? new Date(req.query.currentEndDate as string)
      : new Date();

    const baselineStartDate = req.query.baselineStartDate
      ? new Date(req.query.baselineStartDate as string)
      : new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // Default: 60 days ago
    const baselineEndDate = req.query.baselineEndDate
      ? new Date(req.query.baselineEndDate as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago

    const comparison = await sustainabilityMetricsService.compareWithBaseline(
      currentStartDate,
      currentEndDate,
      baselineStartDate,
      baselineEndDate
    );
    res.json(comparison);
  }));

  /**
   * GET /api/sustainability/report
   * Generate sustainability report
   */
  router.get('/report', asyncHandler(async (req: Request, res: Response) => {
    const format = (req.query.format as 'json' | 'csv' | 'pdf') || 'json';
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    const includeBaseline = req.query.includeBaseline === 'true';
    const baselineStartDate = req.query.baselineStartDate
      ? new Date(req.query.baselineStartDate as string)
      : undefined;
    const baselineEndDate = req.query.baselineEndDate
      ? new Date(req.query.baselineEndDate as string)
      : undefined;

    const report = await reportGenerator.generateReport({
      format,
      startDate,
      endDate,
      includeBaseline,
      baselineStartDate,
      baselineEndDate,
      title: req.query.title as string,
    });

    // Set appropriate content type and headers
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="sustainability-report.json"');
      res.send(report);
    } else if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="sustainability-report.csv"');
      res.send(report);
    } else if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="sustainability-report.pdf"');
      res.send(report);
    }
  }));

  /**
   * GET /api/sustainability/report/monthly
   * Generate monthly sustainability report
   */
  router.get('/report/monthly', asyncHandler(async (req: Request, res: Response) => {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const format = (req.query.format as 'json' | 'csv' | 'pdf') || 'json';

    const report = await reportGenerator.generateMonthlyReport(year, month, format);

    // Set appropriate content type and headers
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sustainability-report-${year}-${month.toString().padStart(2, '0')}.json"`
      );
      res.send(report);
    } else if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sustainability-report-${year}-${month.toString().padStart(2, '0')}.csv"`
      );
      res.send(report);
    } else if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sustainability-report-${year}-${month.toString().padStart(2, '0')}.pdf"`
      );
      res.send(report);
    }
  }));

  /**
   * GET /api/sustainability/report/quarterly
   * Generate quarterly sustainability report
   */
  router.get('/report/quarterly', asyncHandler(async (req: Request, res: Response) => {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const quarter = (parseInt(req.query.quarter as string) as 1 | 2 | 3 | 4) || 1;
    const format = (req.query.format as 'json' | 'csv' | 'pdf') || 'json';

    const report = await reportGenerator.generateQuarterlyReport(year, quarter, format);

    // Set appropriate content type and headers
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sustainability-report-Q${quarter}-${year}.json"`
      );
      res.send(report);
    } else if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sustainability-report-Q${quarter}-${year}.csv"`
      );
      res.send(report);
    } else if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sustainability-report-Q${quarter}-${year}.pdf"`
      );
      res.send(report);
    }
  }));

  return router;
}


