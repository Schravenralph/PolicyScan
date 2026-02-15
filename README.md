# Beleidsscan

A comprehensive React + TypeScript application for scanning, analyzing, and discovering Dutch government policy documents (beleidsdocumenten). Built with Vite, Express, MongoDB, and advanced AI-powered search capabilities.

## Overview

Beleidsscan enables policymakers and urban planners to discover, analyze, and understand policy documents across the entire Dutch government landscape. The application features:

- **Multi-step wizard workflow** for discovering policy documents from multiple sources
- **Hybrid retrieval system** combining keyword and semantic search
- **Knowledge graph integration** for relationship mapping and reasoning
- **Vector embeddings** for semantic document similarity
- **Automated web scraping** from government websites and databases
- **Document review and approval workflow**

## Quick Start

### Option 1: Docker (Recommended)

Docker containerization prevents PC crashes from resource-intensive tests and scrapers, and provides isolated environments for all services.

```bash
# Build and start all services
docker compose up -d

# Or start just the application
docker compose up -d app

# Run tests safely in isolated container
docker compose run --rm test pnpm test

# View logs
docker compose logs -f app

# Access at http://localhost:5173
```

📚 **See [DOCKER.md](./DOCKER.md) for complete Docker usage guide**

### Option 2: Local Installation

#### Prerequisites
- Node.js v18 or higher
- MongoDB Atlas account (or local MongoDB)
- pnpm (recommended)
- (Optional) Neo4j for hierarchical knowledge graph features
- (Optional) Redis for background job processing
- (Optional) Ollama for local LLM reranking - See [Ollama Setup Guide](./docs/02-development/ollama-setup.md)

#### Installation

1. **Clone and install dependencies:**
   ```bash
   pnpm install
   cd server && pnpm install && cd ..
   ```

2. **Set up environment variables:**
   ```bash
   # Copy the example file and fill in your values
   cp .env.example .env
   # Edit .env and add your MongoDB connection string and other required values
   ```

3. **Start the application:**
   ```bash
   # Start both services with health checks
   pnpm start
   ```

   Or run services separately:
   ```bash
   # Terminal 1 - Backend
   pnpm run dev:backend

   # Terminal 2 - Frontend
   pnpm run dev
   ```

4. **Seed the database (optional but recommended):**
   ```bash
   # Seed source documents and websites
   pnpm run seed
   
   # Or seed websites only
   pnpm run seed:websites
   ```

5. **Open your browser:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:4000
   - API Documentation: http://localhost:4000/api-docs

## Available Scripts

### Docker Commands (Recommended)

| Script | Description |
|--------|-------------|
| `pnpm start` | Start application with Docker and health checks |
| `pnpm start:build` | Build and start Docker containers |
| `pnpm start:logs` | Start Docker containers with log output |
| `pnpm stop` | Stop all Docker containers |
| `pnpm restart` | Restart Docker containers |
| `pnpm run docker:up` | Start Docker containers in background |
| `pnpm run docker:down` | Stop Docker containers |
| `pnpm run docker:logs` | View Docker container logs |
| `pnpm run docker:ps` | List running Docker containers |
| `docker compose build` | Build all Docker images |
| `docker compose run --rm test pnpm test` | Run tests in isolated container |
| `docker stats` | Monitor resource usage |

### Development Scripts

| Script | Description |
|--------|-------------|
| `pnpm run dev` | Start frontend development server (Vite) |
| `pnpm run dev:backend` | Start backend development server with watch mode |
| `pnpm run dev:frontend` | Start frontend with backend health check |
| `pnpm run dev:all` | Start both backend and frontend concurrently |
| `pnpm run server` | Run backend server directly (no watch) |
| `pnpm run server:dev` | Run backend server with watch mode |

### Build Scripts

| Script | Description |
|--------|-------------|
| `pnpm run build` | Build frontend only |
| `pnpm run build:backend` | Build backend TypeScript |
| `pnpm run build:frontend` | Build frontend for production |
| `pnpm run build:all` | Build both backend and frontend |
| `pnpm run preview` | Preview production build locally |

### Testing Scripts

| Script | Description |
|--------|-------------|
| `pnpm test` | Run all Jest tests (⚠️ can crash PC, use Docker instead) |
| `pnpm run test:watch` | Run tests in watch mode |
| `pnpm run test:unit` | Run unit tests only (`@unit` tag) |
| `pnpm run test:integration` | Run integration tests only (`@integration` tag) |
| `pnpm run test:e2e` | Run Playwright E2E tests |
| `pnpm run test:e2e:smoke` | Run smoke E2E tests |
| `pnpm run test:component` | Run React component tests |
| `pnpm run test:contract` | Run contract tests |
| `pnpm run test:pipeline` | Run full test pipeline (unit + integration + e2e) |
| `pnpm run coverage` | Generate test coverage report |
| `pnpm run coverage:unit` | Generate unit test coverage |
| `pnpm run coverage:integration` | Generate integration test coverage |

### Health & Validation Scripts

| Script | Description |
|--------|-------------|
| `pnpm run health-check` | Check if all services are running |
| `pnpm run startup-check` | Verify environment setup |
| `pnpm run validate:docker` | Validate Docker configuration |
| `pnpm run lint` | Run ESLint on all code |

## Project Structure

```
beleidsscan/
├── src/
│   ├── client/            # Frontend source
│   │   ├── components/    # React components (wizard, UI components)
│   │   ├── services/      # API service layer
│   │   └── styles/        # CSS styles and Tailwind config
│   ├── server/            # Backend source
│   │   ├── config/        # Server configuration
│   │   ├── models/        # MongoDB models
│   │   ├── routes/        # Express API routes
│   │   ├── services/      # Business logic services
│   │   ├── workflows/     # Workflow definitions and actions
│   │   ├── types/         # TypeScript types
│   │   └── utils/         # Utility functions
│   └── shared/            # Shared types and utilities
├── server/                # Backend entry point and config
│   └── dist/              # Compiled backend output
├── tests/                 # Test files
│   ├── client/            # Frontend tests
│   ├── server/            # Backend tests
│   └── e2e/               # End-to-end tests (Playwright)
├── scripts/               # Utility and migration scripts
│   ├── health-check.js    # Health check script
│   ├── startup-check.js   # Startup verification
│   └── migrations/        # Database migration scripts
├── config/                # Configuration files
│   ├── vite.config.ts    # Vite configuration
│   ├── jest.config.js    # Jest test configuration
│   ├── playwright.config.ts  # Playwright E2E config
│   └── eslint.config.js   # ESLint configuration
├── docs/                  # Comprehensive documentation
│   ├── 01-architecture/   # Architecture documentation
│   ├── 02-development/    # Development guides
│   ├── 03-testing/        # Testing documentation
│   └── ...                # Additional documentation
├── public/                # Static assets
├── brondocumenten.json    # Source documents dataset
└── bronwebsites.json      # Source websites dataset
```

## Documentation

### Getting Started
- [DOCKER.md](./DOCKER.md) - **Docker usage guide (crash prevention)**
- [docs/02-development/ollama-setup.md](./docs/02-development/ollama-setup.md) - **Ollama setup guide for LLM reranking**
- [SETUP.md](./SETUP.md) - Detailed setup instructions
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
- [SECURITY.md](./SECURITY.md) - Security policies

### Architecture & Design
- [docs/01-architecture/](./docs/01-architecture/) - Architecture documentation
  - [Hybrid Retrieval Flow](./docs/01-architecture/hybrid-retrieval-flow.md) - Hybrid retrieval architecture
  - [Vector Storage Design](./docs/01-architecture/vector-storage-design.md) - Vector storage design
  - [Navigation Pattern Learning](./docs/ARCHITECTURE_NAVIGATION_PATTERN_LEARNING.md) - Pattern learning system
- [docs/workflows/beleidsscan-wizard-steps.md](./docs/workflows/beleidsscan-wizard-steps.md) - Wizard workflow steps

### API Documentation
- [server/README.md](./server/README.md) - Backend API documentation
- [docs/api/hybrid-retrieval.md](./docs/api/hybrid-retrieval.md) - Hybrid retrieval API reference
- [swagger.yaml](./swagger.yaml) - OpenAPI specification
- API docs available at: http://localhost:4000/api-docs (when server is running)

### Development Guides
- [docs/02-development/](./docs/02-development/) - Development guides
  - [Quick Start Guide](./docs/02-development/quick-start-guide.md)
  - [Adding Workflow Actions](./docs/02-development/adding-workflow-actions.md)
  - [Testing Workflow Modules](./docs/02-development/testing-workflow-modules.md)
- [docs/03-testing/](./docs/03-testing/) - Testing documentation
  - [Testing Guide](./docs/03-testing/TESTING.md)
  - [Testing Policy](./docs/04-policies/testing_policy.md)
  - [E2E Testing Policy](./docs/03-testing/E2E-TESTING-POLICY.md)
- [docs/04-policies/](./docs/04-policies/) - Development policies
  - [Codebase Organization](./docs/04-policies/codebase-organization.md)
  - [Testing Policy](./docs/04-policies/testing_policy.md)

### Feature Documentation
- [docs/PATTERN_LEARNING_USAGE_EXAMPLES.md](./docs/PATTERN_LEARNING_USAGE_EXAMPLES.md) - Pattern Learning usage examples
- [docs/10-knowledge-graph/](./docs/10-knowledge-graph/) - Knowledge graph documentation
- [docs/12-common-crawl/](./docs/12-common-crawl/) - Common Crawl integration

### Analysis & Research
- [docs/07-analysis/](./docs/07-analysis/) - Codebase analysis and research
- [docs/09-research/](./docs/09-research/) - Research documents

## Environment Variables

All environment variables are stored in a single `.env` file at the project root.

**Quick Setup:**
```bash
cp .env.example .env
# Edit .env and fill in your actual values
```

**Minimum Required Variables:**
```env
# MongoDB connection (REQUIRED)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?appName=n8n-cluster

# Server configuration
PORT=4000
NODE_ENV=development

# Frontend configuration
VITE_API_URL=http://localhost:4000/api
```

**See `.env.example` for a complete list of all available environment variables** with detailed documentation, including:

- MongoDB configuration and connection pool settings
- Neo4j and GraphDB configuration
- Redis and PostgreSQL configuration
- API keys (OpenAI, Google, DSO, etc.)
- Authentication & security (JWT, CSRF)
- Embedding and hybrid retrieval configuration
- Metadata-based ranking configuration
- Pattern learning configuration
- Feature flags
- Logging and monitoring settings

### Email Service Configuration (for password reset)
```bash
SMTP_HOST=smtp.gmail.com                     # SMTP server hostname
SMTP_PORT=587                                # SMTP port (587 for TLS, 465 for SSL)
SMTP_USER=your-email@gmail.com               # SMTP username/email
SMTP_PASSWORD=your-app-password              # SMTP password or app password
EMAIL_FROM=noreply@beleidsscan.nl            # Default sender email address
EMAIL_FROM_NAME=Beleidsscan                  # Default sender name
FRONTEND_URL=http://localhost:5173           # Frontend URL for password reset links
```

### Hybrid Retrieval Score Weights (default: 0.4 keyword, 0.6 semantic)
**These control how keyword and semantic scores are combined in document scoring**
```bash
HYBRID_KEYWORD_WEIGHT=0.4                   # Weight for keyword scores
HYBRID_SEMANTIC_WEIGHT=0.6                  # Weight for semantic scores
SEMANTIC_SIMILARITY_THRESHOLD=0.7           # Minimum similarity (0-1)
```

### Legacy scoring weights (for backward compatibility)
```bash
SCORE_KEYWORD_WEIGHT=0.4
SCORE_SEMANTIC_WEIGHT=0.6
```

### Document Extraction & OCR Configuration
```bash
DOCUMENT_EXTRACTION_OCR_ENABLED=false          # Enable OCR for scanned documents
DOCUMENT_EXTRACTION_OCR_PROVIDER=tesseract      # OCR provider: tesseract|cloud
DOCUMENT_EXTRACTION_OCR_LANGUAGE=nld            # OCR language (default: Dutch)
DOCUMENT_EXTRACTION_OCR_TIMEOUT=30000           # OCR timeout in milliseconds
```

### Knowledge Graph Backend Configuration
**Select the knowledge graph backend: 'graphdb' (default) or 'neo4j'**
-Note: Hierarchical structure features require Neo4j backend
```bash
KG_BACKEND=graphdb                     # graphdb|neo4j (default: graphdb)
# To use hierarchical structure features, set: KG_BACKEND=neo4j
```

### Neo4j Configuration (optional, with sensible defaults)
```bash
NEO4J_URI=bolt://localhost:7687      # Neo4j connection URI (default: bolt://localhost:7687 or bolt://neo4j:7687 in Docker)
NEO4J_USER=neo4j                     # Neo4j username (default: neo4j)
NEO4J_PASSWORD=password               # Neo4j password (default: password)
NEO4J_MAX_CONNECTION_LIFETIME_MS=10800000  # Max connection lifetime in ms (default: 3 hours)
NEO4J_MAX_POOL_SIZE=50               # Max connection pool size (default: 50)
NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS=120000  # Connection acquisition timeout in ms (default: 2 minutes)
NEO4J_HEALTH_CHECK_INTERVAL_MS=30000 # Health check interval in ms (default: 30 seconds)
```

### Knowledge Graph Feature Flags
**Enable/disable knowledge graph features for benchmarking and A/B testing**
```bash
KG_RETRIEVAL_ENABLED=true              # Enable KG-based retrieval in hybrid search (default: true)
KG_EXTRACTION_ENABLED=true             # Enable structured extraction from documents (default: true)
KG_VALIDATION_ENABLED=true             # Enable KG validation pipeline (default: true)
KG_REASONING_ENABLED=true              # Enable multi-hop graph reasoning (default: true)
KG_HIERARCHICAL_STRUCTURE_ENABLED=true # Enable hierarchical structure features (requires Neo4j backend)
```
-**Note: Flags can also be managed via /api/feature-flags admin API at runtime**
-**Environment variables take precedence over database values**

### PDF-to-Image Conversion Configuration (for OCR)
```bash
PDF_TO_IMAGE_ENABLED=true                      # Enable PDF-to-image conversion (default: true if OCR enabled)
PDF_TO_IMAGE_DPI=200                           # Image resolution in DPI (150, 200, 300)
PDF_TO_IMAGE_FORMAT=png                        # Image format: png|jpeg
PDF_TO_IMAGE_MAX_PAGES=0                       # Maximum pages to process (0 = no limit)
PDF_TO_IMAGE_QUALITY=0.95                      # JPEG quality 0-1 (only for JPEG format)
```

## Features

### Core Functionality

- ✅ **Multi-step Wizard Workflow**: 8-step backend workflow for comprehensive document discovery
  - Step 1: DSO Omgevingsdocumenten discovery
  - Step 2: DSO document enrichment (optional)
  - Step 3: IPLO document search
  - Step 4: Known source scanning
  - Step 5: Merge, score, and categorize
  - Step 6: Official publications search (Officiele Bekendmakingen)
  - Step 7: Jurisprudence search (Rechtspraak)
  - Step 8: Common Crawl deep discovery (optional)

- ✅ **Frontend Wizard UI**: 3-step user interface for query configuration, website selection, and document review
- ✅ **Government Level Selection**: Filter by gemeente, waterschap, provincie, rijksoverheid
- ✅ **Subject and Theme Filtering**: Advanced filtering by subject (onderwerp) and theme (thema)
- ✅ **Document Review Workflow**: Approve/reject documents with custom additions
- ✅ **MongoDB Persistence**: All data stored in MongoDB with comprehensive models

### Search & Retrieval

- ✅ **Hybrid Retrieval**: Combines keyword and semantic search for improved document discovery
- ✅ **Vector Embeddings**: Semantic search using document embeddings (Xenova/all-MiniLM-L6-v2)
- ✅ **Metadata-Based Ranking**: Enhanced ranking using document metadata (type, themes, authority, dates)
- ✅ **Knowledge Graph Integration**: GraphDB/Neo4j support for relationship mapping and multi-hop reasoning
- ✅ **Navigation Graph**: Automated discovery of policy document relationships

### Data Sources

- ✅ **DSO (Omgevingswet)**: Integration with Omgevingsinformatie Ontsluiten v2 API
- ✅ **IPLO**: Search IPLO policy documents
- ✅ **Officiele Bekendmakingen**: Official government publications (SRU API)
- ✅ **Rechtspraak**: Jurisprudence database search
- ✅ **Common Crawl**: Optional deep web discovery
- ✅ **Web Scraping**: Automated scraping from government websites

### Technical Features

- ✅ **RESTful API**: TypeScript-based Express API with OpenAPI documentation
- ✅ **Real-time Health Monitoring**: Health check endpoints and monitoring
- ✅ **Server-Sent Events (SSE)**: Real-time workflow log streaming with automatic reconnection
- ✅ **Workflow Engine**: Configurable workflow system with action-based architecture
- ✅ **Background Job Processing**: Redis/Bull queue for async operations
- ✅ **Document Export**: Multiple export formats (CSV, PDF, JSON, Markdown, TSV, HTML, XML, XLSX)
- ✅ **OCR Support**: Tesseract.js integration for scanned document processing
- ✅ **Admin Dashboard**: Workflow management, analytics, and error monitoring

## Tech Stack

### Frontend
- **React 19** + **TypeScript** - Modern React with latest features
- **Vite** - Fast build tool and dev server
- **Tailwind CSS 4** - Utility-first CSS framework
- **Radix UI** - Accessible component primitives
- **Lucide React** - Icon library
- **React Router** - Client-side routing
- **React Hook Form** - Form management
- **Zod** - Schema validation

### Backend
- **Express** + **TypeScript** - Web framework
- **MongoDB** - Document database (Atlas or local)
- **Neo4j** - Graph database (optional, for hierarchical features)
- **GraphDB** - RDF knowledge graph (default)
- **Redis** - Caching and job queue (Bull)
- **tsx** - TypeScript execution without compilation
- **@xenova/transformers** - Vector embeddings (all-MiniLM-L6-v2)
- **Tesseract.js** - OCR for scanned documents
- **Socket.io** - Real-time bidirectional communication (metrics, progress)
- **Server-Sent Events (SSE)** - Real-time log streaming (workflow logs)

### Testing & Quality
- **Jest** - Unit and integration testing
- **Playwright** - End-to-end browser testing
- **ESLint** - Code linting
- **TypeScript** - Type safety
- **Stryker** - Mutation testing

### Development Tools
- **Concurrently** - Run multiple services
- **wait-on** - Service readiness checks
- **Husky** - Git hooks
- **Commitlint** - Commit message validation
- **Nx** - Monorepo tooling (optional)

## Testing

The project includes comprehensive testing infrastructure with **200+ test files** across multiple layers:

### Test Types

- **Unit Tests**: Fast, isolated component and function tests (Jest)
- **Integration Tests**: API and service integration tests (Jest + Supertest)
- **E2E Tests**: Full browser tests with Playwright (100+ tests)
- **Component Tests**: React component tests with Testing Library
- **Contract Tests**: API contract validation

### Running Tests

```bash
# Run all tests (⚠️ can crash PC, use Docker instead)
pnpm test

# Run specific test suites
pnpm run test:unit              # Unit tests only
pnpm run test:integration      # Integration tests only
pnpm run test:e2e              # E2E tests
pnpm run test:component        # Component tests

# Run tests in Docker (recommended)
docker compose run --rm test pnpm test

# Generate coverage report
pnpm run coverage
```

### Test Dashboard

Access the test dashboard for visual analytics:
- **Via Server**: http://localhost:4000/test-dashboard (when server is running)
- **Static File**: Open `public/test-dashboard.html` in browser

📚 **See [Testing Guide](./docs/03-testing/TESTING.md) for comprehensive testing documentation**

## Troubleshooting

### Services won't start
Run the startup check to identify issues:
```bash
pnpm run startup-check
```

### Health check fails
Verify services are running:
```bash
pnpm run health-check
```

### MongoDB connection errors
1. Check your MongoDB URI in `.env`
2. Verify your database password
3. Ensure your IP is whitelisted in MongoDB Atlas
4. Check MongoDB connection string format

### Docker issues
1. Verify Docker is running: `docker ps`
2. Check container logs: `docker compose logs app`
3. Validate Docker config: `pnpm run validate:docker`
4. See [DOCKER.md](./DOCKER.md) for detailed troubleshooting

### Tests crashing or hanging
- **Use Docker**: Run tests in isolated containers to prevent resource issues
- **Check memory**: Tests may require significant memory
- **Review test logs**: Check for specific test failures
- **Run specific suites**: Use `test:unit` or `test:integration` instead of all tests

### Hybrid Retrieval

**Enable Hybrid Retrieval:**
1. Set `HYBRID_RETRIEVAL_ENABLED=true` in `.env`
2. Set `EMBEDDING_ENABLED=true` to generate embeddings
3. Restart the backend server

**Generate Embeddings for Existing Documents:**
```bash
# Run migration script to generate embeddings for existing documents
pnpm run migrate-embeddings
```

**Check Embedding Status:**
```bash
# Connect to MongoDB and check
mongosh "your-connection-string"
use beleidsscan
db.brondocumenten.countDocuments({ embedding: { $exists: true } })
```

**Documentation:**
- See [Hybrid Retrieval Flow](./docs/01-architecture/hybrid-retrieval-flow.md) for architecture details
- See [API Documentation](./docs/api/hybrid-retrieval.md) for API usage
- See [Vector Storage Design](./docs/01-architecture/vector-storage-design.md) for storage details

### Knowledge Graph Issues

**GraphDB Connection:**
- Verify GraphDB is running (if using GraphDB backend)
- Check `KG_BACKEND` setting in `.env`

**Neo4j Connection:**
- Ensure Neo4j is running and accessible
- Set `KG_BACKEND=neo4j` in `.env`
- Verify Neo4j connection credentials

### Workflow Issues

**Workflow not executing:**
- Check Redis connection (required for workflow queue)
- Verify workflow definitions in `src/server/workflows/`
- Check workflow logs via admin dashboard

**Workflow errors:**
- Review error logs in admin dashboard
- Check workflow action implementations
- Verify external API connections (DSO, IPLO, etc.)

## License

Private - Ruimtemeesters

## Support

For issues and questions, contact ralph@ruimtemeesters.nl
