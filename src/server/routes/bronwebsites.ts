import express, { Request, Response } from 'express';
import { BronWebsite } from '../models/BronWebsite.js';
import type { BronWebsiteCreateInput } from '../types/index.js';
import { validate } from '../middleware/validation.js';
import { sanitizeInput } from '../middleware/sanitize.js';
import { bronWebsiteSchemas } from '../validation/bronwebsitesSchemas.js';
import { parsePaginationParams, createPaginationMetadata } from '../utils/pagination.js';
import { HTTP_STATUS, PAGINATION } from '../config/constants.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError, NotFoundError } from '../types/errors.js';

const router = express.Router();

// Get all bronwebsites with pagination
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  // Parse pagination parameters using utility function
  const { limit, skip, page } = parsePaginationParams(req.query, { 
    defaultLimit: PAGINATION.DEFAULT_LIMIT, 
    maxLimit: PAGINATION.MAX_LIMIT 
  });

  // Get websites and total count
  const [websites, total] = await Promise.all([
    BronWebsite.findAll({ limit, skip, sort: { createdAt: -1 } }),
    BronWebsite.count()
  ]);

  // Create pagination metadata
  const pagination = createPaginationMetadata(total, limit, page, skip);

  res.json({
    data: websites,
    pagination,
  });
}));

// Create a new bronwebsite
router.post('/', sanitizeInput, validate(bronWebsiteSchemas.create), asyncHandler(async (req: Request, res: Response) => {
  const websiteData: BronWebsiteCreateInput = req.body;
  const website = await BronWebsite.create(websiteData);
  res.status(HTTP_STATUS.CREATED).json(website);
}));

// Create multiple bronwebsites
router.post('/bulk', sanitizeInput, validate(bronWebsiteSchemas.createMany), asyncHandler(async (req: Request, res: Response) => {
  // Validate that req.body is an array to prevent type confusion attacks
  if (!Array.isArray(req.body)) {
    throw new BadRequestError('Request body must be an array of bronwebsite objects', {
      received: typeof req.body,
    });
  }
  const websitesData: BronWebsiteCreateInput[] = req.body;
  const websites = await BronWebsite.createMany(websitesData);
  res.status(HTTP_STATUS.CREATED).json(websites);
}));

// Get bronwebsites by query ID
router.get('/query/:queryId', validate(bronWebsiteSchemas.getByQuery), asyncHandler(async (req: Request, res: Response) => {
  // Parse pagination parameters using utility function
  const { limit, skip, page } = parsePaginationParams(req.query, { 
    defaultLimit: PAGINATION.DEFAULT_LIMIT, 
    maxLimit: PAGINATION.MAX_LIMIT 
  });

  // Get websites and total count
  const [websites, total] = await Promise.all([
    BronWebsite.findByQueryId(req.params.queryId, { limit, skip }),
    BronWebsite.countByQueryId(req.params.queryId)
  ]);

  // Create pagination metadata
  const pagination = createPaginationMetadata(total, limit, page, skip);

  res.json({
    data: websites,
    pagination,
  });
}));

// Get a bronwebsite by ID
router.get('/:id', validate(bronWebsiteSchemas.getById), asyncHandler(async (req: Request, res: Response) => {
  const website = await BronWebsite.findById(req.params.id);
  if (!website) {
    throw new NotFoundError('Bronwebsite', req.params.id);
  }
  res.json(website);
}));

// Update a bronwebsite
router.patch('/:id', sanitizeInput, validate(bronWebsiteSchemas.update), asyncHandler(async (req: Request, res: Response) => {
  const website = await BronWebsite.update(req.params.id, req.body);
  if (!website) {
    throw new NotFoundError('Bronwebsite', req.params.id);
  }
  res.json(website);
}));

// Update acceptance status
router.patch('/:id/acceptance', sanitizeInput, validate(bronWebsiteSchemas.updateAcceptance), asyncHandler(async (req: Request, res: Response) => {
  const { accepted } = req.body;
  const website = await BronWebsite.updateAcceptance(req.params.id, accepted);
  if (!website) {
    throw new NotFoundError('Bronwebsite', req.params.id);
  }
  res.json(website);
}));

// Delete a bronwebsite
router.delete('/:id', validate(bronWebsiteSchemas.delete), asyncHandler(async (req: Request, res: Response) => {
  const deleted = await BronWebsite.delete(req.params.id);
  if (!deleted) {
    throw new NotFoundError('Bronwebsite', req.params.id);
  }
  res.status(HTTP_STATUS.NO_CONTENT).send();
}));

export default router;
