# Beleidsscan

Een uitgebreide React + TypeScript applicatie voor het scannen, analyseren en ontdekken van Nederlandse overheidsbeleidsdocumenten (beleidsdocumenten). Gebouwd met Vite, Express, MongoDB en geavanceerde AI-gedreven zoekmogelijkheden.

> 📖 **English version available**: [README.en.md](./README.en.md)

## Overzicht

Beleidsscan stelt beleidsmakers en stedenbouwkundigen in staat om beleidsdocumenten te ontdekken, analyseren en begrijpen in het hele Nederlandse overheidslandschap. De applicatie bevat:

- **Multi-step wizard workflow** voor het ontdekken van beleidsdocumenten uit meerdere bronnen
- **Hybride retrievalsysteem** dat zoekwoorden en semantisch zoeken combineert
- **Knowledge graph integratie** voor relatiemapping en redenering
- **Vector embeddings** voor semantische documentgelijkenis
- **Geautomatiseerd web scraping** van overheidswebsites en databases
- **Document review en goedkeuringsworkflow**

## Snel Starten

### Optie 1: Docker (Aanbevolen)

Docker containerisatie voorkomt PC-crashes door resource-intensieve tests en scrapers, en biedt geïsoleerde omgevingen voor alle services.

```bash
# Bouw en start alle services
docker compose up -d

# Of start alleen de applicatie
docker compose up -d app

# Voer tests veilig uit in geïsoleerde container
docker compose run --rm test pnpm test

# Bekijk logs
docker compose logs -f app

# Toegang op http://localhost:5173
```

📚 **Zie [DOCKER.md](./DOCKER.md) voor de volledige Docker gebruikersgids**

### Optie 2: Lokale Installatie

#### Vereisten
- Node.js v18 of hoger
- MongoDB Atlas account (of lokale MongoDB)
- pnpm (aanbevolen)
- (Optioneel) Neo4j voor hiërarchische knowledge graph functies
- (Optioneel) Redis voor achtergrond job processing
- (Optioneel) Ollama voor lokale LLM reranking - Zie [Ollama Setup Guide](./docs/02-development/ollama-setup.md)

#### Installatie

1. **Clone en installeer dependencies:**
   ```bash
   pnpm install
   cd server && pnpm install && cd ..
   ```

2. **Stel omgevingsvariabelen in:**
   ```bash
   # Kopieer het voorbeeldbestand en vul je waarden in
   cp .env.example .env
   # Bewerk .env en voeg je MongoDB connection string en andere vereiste waarden toe
   ```

3. **Start de applicatie:**
   ```bash
   # Start beide services met health checks
   pnpm start
   ```

   Of voer services apart uit:
   ```bash
   # Terminal 1 - Backend
   pnpm run dev:backend

   # Terminal 2 - Frontend
   pnpm run dev
   ```

4. **Seed de database (optioneel maar aanbevolen):**
   ```bash
   # Seed brondocumenten en websites
   pnpm run seed
   
   # Of seed alleen websites
   pnpm run seed:websites
   ```

5. **Open je browser:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:4000
   - API Documentatie: http://localhost:4000/api-docs

## Beschikbare Scripts

### Docker Commando's (Aanbevolen)

| Script | Beschrijving |
|--------|-------------|
| `pnpm start` | Start applicatie met Docker en health checks |
| `pnpm start:build` | Bouw en start Docker containers |
| `pnpm start:logs` | Start Docker containers met log output |
| `pnpm stop` | Stop alle Docker containers |
| `pnpm restart` | Herstart Docker containers |
| `pnpm run docker:up` | Start Docker containers op de achtergrond |
| `pnpm run docker:down` | Stop Docker containers |
| `pnpm run docker:logs` | Bekijk Docker container logs |
| `pnpm run docker:ps` | Toon draaiende Docker containers |
| `docker compose build` | Bouw alle Docker images |
| `docker compose run --rm test pnpm test` | Voer tests uit in geïsoleerde container |
| `docker stats` | Monitor resource gebruik |

### Development Scripts

| Script | Beschrijving |
|--------|-------------|
| `pnpm run dev` | Start frontend development server (Vite) |
| `pnpm run dev:backend` | Start backend development server met watch mode |
| `pnpm run dev:frontend` | Start frontend met backend health check |
| `pnpm run dev:all` | Start zowel backend als frontend gelijktijdig |
| `pnpm run server` | Voer backend server direct uit (geen watch) |
| `pnpm run server:dev` | Voer backend server uit met watch mode |

### Build Scripts

| Script | Beschrijving |
|--------|-------------|
| `pnpm run build` | Bouw alleen frontend |
| `pnpm run build:backend` | Bouw backend TypeScript |
| `pnpm run build:frontend` | Bouw frontend voor productie |
| `pnpm run build:all` | Bouw zowel backend als frontend |
| `pnpm run preview` | Preview productie build lokaal |

### Testing Scripts

| Script | Beschrijving |
|--------|-------------|
| `pnpm test` | Voer alle Jest tests uit (⚠️ kan PC crashen, gebruik Docker in plaats daarvan) |
| `pnpm run test:watch` | Voer tests uit in watch mode |
| `pnpm run test:unit` | Voer alleen unit tests uit (`@unit` tag) |
| `pnpm run test:integration` | Voer alleen integration tests uit (`@integration` tag) |
| `pnpm run test:e2e` | Voer Playwright E2E tests uit |
| `pnpm run test:e2e:smoke` | Voer smoke E2E tests uit |
| `pnpm run test:component` | Voer React component tests uit |
| `pnpm run test:contract` | Voer contract tests uit |
| `pnpm run test:pipeline` | Voer volledige test pipeline uit (unit + integration + e2e) |
| `pnpm run coverage` | Genereer test coverage rapport |
| `pnpm run coverage:unit` | Genereer unit test coverage |
| `pnpm run coverage:integration` | Genereer integration test coverage |

### Health & Validatie Scripts

| Script | Beschrijving |
|--------|-------------|
| `pnpm run health-check` | Controleer of alle services draaien |
| `pnpm run startup-check` | Verifieer omgevingssetup |
| `pnpm run validate:docker` | Valideer Docker configuratie |
| `pnpm run lint` | Voer ESLint uit op alle code |

## Projectstructuur

```
beleidsscan/
├── src/
│   ├── client/            # Frontend source
│   │   ├── components/    # React components (wizard, UI components)
│   │   ├── services/      # API service layer
│   │   └── styles/        # CSS styles en Tailwind config
│   ├── server/            # Backend source
│   │   ├── config/        # Server configuratie
│   │   ├── models/        # MongoDB models
│   │   ├── routes/        # Express API routes
│   │   ├── services/      # Business logic services
│   │   ├── workflows/     # Workflow definities en acties
│   │   ├── types/         # TypeScript types
│   │   └── utils/         # Utility functies
│   └── shared/            # Gedeelde types en utilities
├── server/                # Backend entry point en config
│   └── dist/              # Gecompileerde backend output
├── tests/                 # Test bestanden
│   ├── client/            # Frontend tests
│   ├── server/            # Backend tests
│   └── e2e/               # End-to-end tests (Playwright)
├── scripts/               # Utility en migratie scripts
│   ├── health-check.js    # Health check script
│   ├── startup-check.js   # Startup verificatie
│   └── migrations/        # Database migratie scripts
├── config/                # Configuratie bestanden
│   ├── vite.config.ts    # Vite configuratie
│   ├── jest.config.js    # Jest test configuratie
│   ├── playwright.config.ts  # Playwright E2E config
│   └── eslint.config.js   # ESLint configuratie
├── docs/                  # Uitgebreide documentatie
│   ├── 01-architecture/   # Architectuur documentatie
│   ├── 02-development/    # Development guides
│   ├── 03-testing/        # Testing documentatie
│   └── ...                # Aanvullende documentatie
├── public/                # Statische assets
├── brondocumenten.json    # Brondocumenten dataset
└── bronwebsites.json      # Bronwebsites dataset
```

## Documentatie

### Aan de Slag
- [DOCKER.md](./DOCKER.md) - **Docker gebruikersgids (crash preventie)**
- [docs/02-development/ollama-setup.md](./docs/02-development/ollama-setup.md) - **Ollama setup gids voor LLM reranking**
- [SETUP.md](./SETUP.md) - Gedetailleerde setup instructies
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Bijdrage richtlijnen
- [SECURITY.md](./SECURITY.md) - Beveiligingsbeleid

### Architectuur & Ontwerp
- [docs/01-architecture/](./docs/01-architecture/) - Architectuur documentatie
  - [Hybrid Retrieval Flow](./docs/01-architecture/hybrid-retrieval-flow.md) - Hybride retrieval architectuur
  - [Vector Storage Design](./docs/01-architecture/vector-storage-design.md) - Vector storage ontwerp
  - [Navigation Pattern Learning](./docs/ARCHITECTURE_NAVIGATION_PATTERN_LEARNING.md) - Pattern learning systeem
- [docs/workflows/beleidsscan-wizard-steps.md](./docs/workflows/beleidsscan-wizard-steps.md) - Wizard workflow stappen

### API Documentatie
- [server/README.md](./server/README.md) - Backend API documentatie
- [docs/api/hybrid-retrieval.md](./docs/api/hybrid-retrieval.md) - Hybride retrieval API referentie
- [swagger.yaml](./swagger.yaml) - OpenAPI specificatie
- API docs beschikbaar op: http://localhost:4000/api-docs (wanneer server draait)

### Development Guides
- [docs/02-development/](./docs/02-development/) - Development guides
  - [Quick Start Guide](./docs/02-development/quick-start-guide.md)
  - [Adding Workflow Actions](./docs/02-development/adding-workflow-actions.md)
  - [Testing Workflow Modules](./docs/02-development/testing-workflow-modules.md)
- [docs/03-testing/](./docs/03-testing/) - Testing documentatie
  - [Testing Guide](./docs/03-testing/TESTING.md)
  - [Testing Policy](./docs/04-policies/testing_policy.md)
  - [E2E Testing Policy](./docs/03-testing/E2E-TESTING-POLICY.md)
- [docs/04-policies/](./docs/04-policies/) - Development policies
  - [Codebase Organization](./docs/04-policies/codebase-organization.md)
  - [Testing Policy](./docs/04-policies/testing_policy.md)

### Feature Documentatie
- [docs/PATTERN_LEARNING_USAGE_EXAMPLES.md](./docs/PATTERN_LEARNING_USAGE_EXAMPLES.md) - Pattern Learning gebruiksvoorbeelden
- [docs/10-knowledge-graph/](./docs/10-knowledge-graph/) - Knowledge graph documentatie
- [docs/12-common-crawl/](./docs/12-common-crawl/) - Common Crawl integratie

### Analyse & Onderzoek
- [docs/07-analysis/](./docs/07-analysis/) - Codebase analyse en onderzoek
- [docs/09-research/](./docs/09-research/) - Onderzoeksdocumenten

## Omgevingsvariabelen

Alle omgevingsvariabelen worden opgeslagen in een enkel `.env` bestand in de project root.

**Snelle Setup:**
```bash
cp .env.example .env
# Bewerk .env en vul je werkelijke waarden in
```

**Minimaal Vereiste Variabelen:**
```env
# MongoDB verbinding (VERPLICHT)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?appName=n8n-cluster

# Server configuratie
PORT=4000
NODE_ENV=development

# Frontend configuratie
VITE_API_URL=http://localhost:4000/api
```

**Zie `.env.example` voor een volledige lijst van alle beschikbare omgevingsvariabelen** met gedetailleerde documentatie, inclusief:

- MongoDB configuratie en connection pool instellingen
- Neo4j en GraphDB configuratie
- Redis en PostgreSQL configuratie
- API keys (OpenAI, Google, DSO, etc.)
- Authenticatie & beveiliging (JWT, CSRF)
- Embedding en hybride retrieval configuratie
- Metadata-gebaseerde ranking configuratie
- Pattern learning configuratie
- Feature flags
- Logging en monitoring instellingen

# Email Service Configuratie (voor wachtwoord reset)
SMTP_HOST=smtp.gmail.com                     # SMTP server hostname
SMTP_PORT=587                                # SMTP poort (587 voor TLS, 465 voor SSL)
SMTP_USER=your-email@gmail.com               # SMTP gebruikersnaam/email
SMTP_PASSWORD=your-app-password              # SMTP wachtwoord of app wachtwoord
EMAIL_FROM=noreply@beleidsscan.nl            # Standaard afzender email adres
EMAIL_FROM_NAME=Beleidsscan                  # Standaard afzender naam
FRONTEND_URL=http://localhost:5173           # Frontend URL voor wachtwoord reset links

# Hybride Retrieval Score Weights (standaard: 0.4 keyword, 0.6 semantisch)
# Deze bepalen hoe keyword en semantische scores worden gecombineerd in document scoring
HYBRID_KEYWORD_WEIGHT=0.4                   # Gewicht voor keyword scores
HYBRID_SEMANTIC_WEIGHT=0.6                  # Gewicht voor semantische scores
SEMANTIC_SIMILARITY_THRESHOLD=0.7           # Minimale gelijkenis (0-1)

# Legacy scoring weights (voor backward compatibility)
SCORE_KEYWORD_WEIGHT=0.4
SCORE_SEMANTIC_WEIGHT=0.6

# Document Extractie & OCR Configuratie
DOCUMENT_EXTRACTION_OCR_ENABLED=false          # Schakel OCR in voor gescande documenten
DOCUMENT_EXTRACTION_OCR_PROVIDER=tesseract      # OCR provider: tesseract|cloud
DOCUMENT_EXTRACTION_OCR_LANGUAGE=nld            # OCR taal (standaard: Nederlands)
DOCUMENT_EXTRACTION_OCR_TIMEOUT=30000           # OCR timeout in milliseconden

# Knowledge Graph Backend Configuratie
# Selecteer de knowledge graph backend: 'graphdb' (standaard) of 'neo4j'
# Let op: Hiërarchische structuur functies vereisen Neo4j backend
KG_BACKEND=graphdb                     # graphdb|neo4j (standaard: graphdb)
# Om hiërarchische structuur functies te gebruiken, stel in: KG_BACKEND=neo4j

# Neo4j Configuratie (optioneel, met redelijke standaardwaarden)
# NEO4J_URI=bolt://localhost:7687      # Neo4j verbinding URI (standaard: bolt://localhost:7687 of bolt://neo4j:7687 in Docker)
# NEO4J_USER=neo4j                     # Neo4j gebruikersnaam (standaard: neo4j)
# NEO4J_PASSWORD=password               # Neo4j wachtwoord (standaard: password)
# NEO4J_MAX_CONNECTION_LIFETIME_MS=10800000  # Max verbindingslevensduur in ms (standaard: 3 uur)
# NEO4J_MAX_POOL_SIZE=50               # Max connection pool grootte (standaard: 50)
# NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS=120000  # Verbindingsacquisitie timeout in ms (standaard: 2 minuten)
# NEO4J_HEALTH_CHECK_INTERVAL_MS=30000 # Health check interval in ms (standaard: 30 seconden)

# Knowledge Graph Feature Flags
# Schakel knowledge graph functies in/uit voor benchmarking en A/B testing
KG_RETRIEVAL_ENABLED=true              # Schakel KG-gebaseerde retrieval in hybride zoekopdracht in (standaard: true)
KG_EXTRACTION_ENABLED=true             # Schakel gestructureerde extractie uit documenten in (standaard: true)
KG_VALIDATION_ENABLED=true             # Schakel KG validatie pipeline in (standaard: true)
KG_REASONING_ENABLED=true              # Schakel multi-hop graph redenering in (standaard: true)
KG_HIERARCHICAL_STRUCTURE_ENABLED=true # Schakel hiërarchische structuur functies in (vereist Neo4j backend)
# Let op: Flags kunnen ook worden beheerd via /api/feature-flags admin API tijdens runtime
# Omgevingsvariabelen hebben voorrang boven database waarden

# PDF-naar-Afbeelding Conversie Configuratie (voor OCR)
PDF_TO_IMAGE_ENABLED=true                      # Schakel PDF-naar-afbeelding conversie in (standaard: true als OCR ingeschakeld)
PDF_TO_IMAGE_DPI=200                           # Afbeeldingsresolutie in DPI (150, 200, 300)
PDF_TO_IMAGE_FORMAT=png                        # Afbeeldingsformaat: png|jpeg
PDF_TO_IMAGE_MAX_PAGES=0                       # Maximum aantal pagina's om te verwerken (0 = geen limiet)
PDF_TO_IMAGE_QUALITY=0.95                      # JPEG kwaliteit 0-1 (alleen voor JPEG formaat)
```

## Functies

### Kernfunctionaliteit

- ✅ **Multi-step Wizard Workflow**: 8-stap backend workflow voor uitgebreide documentontdekking
  - Stap 1: DSO Omgevingsdocumenten ontdekking
  - Stap 2: DSO document verrijking (optioneel)
  - Stap 3: IPLO document zoeken
  - Stap 4: Bekende bron scanning
  - Stap 5: Samenvoegen, scoren en categoriseren
  - Stap 6: Officiële publicaties zoeken (Officiele Bekendmakingen)
  - Stap 7: Jurisprudentie zoeken (Rechtspraak)
  - Stap 8: Common Crawl diepe ontdekking (optioneel)

- ✅ **Frontend Wizard UI**: 3-stap gebruikersinterface voor query configuratie, website selectie en document review
- ✅ **Overheidsniveau Selectie**: Filter op gemeente, waterschap, provincie, rijksoverheid
- ✅ **Onderwerp en Thema Filtering**: Geavanceerde filtering op onderwerp en thema
- ✅ **Document Review Workflow**: Documenten goedkeuren/afwijzen met aangepaste toevoegingen
- ✅ **MongoDB Persistence**: Alle data opgeslagen in MongoDB met uitgebreide models

### Zoeken & Retrieval

- ✅ **Hybride Retrieval**: Combineert keyword en semantisch zoeken voor verbeterde documentontdekking
- ✅ **Vector Embeddings**: Semantisch zoeken met document embeddings (Xenova/all-MiniLM-L6-v2)
- ✅ **Metadata-gebaseerde Ranking**: Verbeterde ranking met document metadata (type, thema's, autoriteit, datums)
- ✅ **Knowledge Graph Integratie**: GraphDB/Neo4j ondersteuning voor relatiemapping en multi-hop redenering
- ✅ **Navigation Graph**: Geautomatiseerde ontdekking van beleidsdocument relaties

### Databronnen

- ✅ **DSO (Omgevingswet)**: Integratie met Omgevingsinformatie Ontsluiten v2 API
- ✅ **IPLO**: Zoek IPLO beleidsdocumenten
- ✅ **Officiele Bekendmakingen**: Officiële overheidspublicaties (SRU API)
- ✅ **Rechtspraak**: Jurisprudentie database zoeken
- ✅ **Common Crawl**: Optionele diepe web ontdekking
- ✅ **Web Scraping**: Geautomatiseerd scraping van overheidswebsites

### Technische Functies

- ✅ **RESTful API**: TypeScript-gebaseerde Express API met OpenAPI documentatie
- ✅ **Real-time Health Monitoring**: Health check endpoints en monitoring
- ✅ **Server-Sent Events (SSE)**: Real-time workflow log streaming met automatische herverbinding
- ✅ **Workflow Engine**: Configureerbaar workflow systeem met action-based architectuur
- ✅ **Achtergrond Job Processing**: Redis/Bull queue voor async operaties
- ✅ **Document Export**: Meerdere export formaten (CSV, PDF, JSON, Markdown, TSV, HTML, XML, XLSX)
- ✅ **OCR Ondersteuning**: Tesseract.js integratie voor gescande documentverwerking
- ✅ **Admin Dashboard**: Workflow beheer, analytics en error monitoring

## Tech Stack

### Frontend
- **React 19** + **TypeScript** - Modern React met nieuwste functies
- **Vite** - Snelle build tool en dev server
- **Tailwind CSS 4** - Utility-first CSS framework
- **Radix UI** - Toegankelijke component primitieven
- **Lucide React** - Icon bibliotheek
- **React Router** - Client-side routing
- **React Hook Form** - Form beheer
- **Zod** - Schema validatie

### Backend
- **Express** + **TypeScript** - Web framework
- **MongoDB** - Document database (Atlas of lokaal)
- **Neo4j** - Graph database (optioneel, voor hiërarchische functies)
- **GraphDB** - RDF knowledge graph (standaard)
- **Redis** - Caching en job queue (Bull)
- **tsx** - TypeScript uitvoering zonder compilatie
- **@xenova/transformers** - Vector embeddings (all-MiniLM-L6-v2)
- **Tesseract.js** - OCR voor gescande documenten
- **Socket.io** - Real-time bidirectionele communicatie (metrics, progress)
- **Server-Sent Events (SSE)** - Real-time log streaming (workflow logs)

### Testing & Kwaliteit
- **Jest** - Unit en integration testing
- **Playwright** - End-to-end browser testing
- **ESLint** - Code linting
- **TypeScript** - Type safety
- **Stryker** - Mutation testing

### Development Tools
- **Concurrently** - Voer meerdere services uit
- **wait-on** - Service readiness checks
- **Husky** - Git hooks
- **Commitlint** - Commit bericht validatie
- **Nx** - Monorepo tooling (optioneel)

## Testing

Het project bevat uitgebreide testinfrastructuur met **200+ test bestanden** over meerdere lagen:

### Test Types

- **Unit Tests**: Snelle, geïsoleerde component en functie tests (Jest)
- **Integration Tests**: API en service integration tests (Jest + Supertest)
- **E2E Tests**: Volledige browser tests met Playwright (100+ tests)
- **Component Tests**: React component tests met Testing Library
- **Contract Tests**: API contract validatie

### Tests Uitvoeren

```bash
# Voer alle tests uit (⚠️ kan PC crashen, gebruik Docker in plaats daarvan)
pnpm test

# Voer specifieke test suites uit
pnpm run test:unit              # Alleen unit tests
pnpm run test:integration      # Alleen integration tests
pnpm run test:e2e              # E2E tests
pnpm run test:component        # Component tests

# Voer tests uit in Docker (aanbevolen)
docker compose run --rm test pnpm test

# Genereer coverage rapport
pnpm run coverage
```

### Test Dashboard

Toegang tot het test dashboard voor visuele analytics:
- **Via Server**: http://localhost:4000/test-dashboard (wanneer server draait)
- **Statisch Bestand**: Open `public/test-dashboard.html` in browser

📚 **Zie [Testing Guide](./docs/03-testing/TESTING.md) voor uitgebreide testing documentatie**

## Probleemoplossing

### Services starten niet
Voer de startup check uit om problemen te identificeren:
```bash
pnpm run startup-check
```

### Health check faalt
Verifieer dat services draaien:
```bash
pnpm run health-check
```

### MongoDB verbindingsfouten
1. Controleer je MongoDB URI in `.env`
2. Verifieer je database wachtwoord
3. Zorg dat je IP is whitelisted in MongoDB Atlas
4. Controleer MongoDB connection string formaat

### Docker problemen
1. Verifieer dat Docker draait: `docker ps`
2. Controleer container logs: `docker compose logs app`
3. Valideer Docker config: `pnpm run validate:docker`
4. Zie [DOCKER.md](./DOCKER.md) voor gedetailleerde probleemoplossing

### Tests crashen of hangen
- **Gebruik Docker**: Voer tests uit in geïsoleerde containers om resource problemen te voorkomen
- **Controleer geheugen**: Tests kunnen aanzienlijk geheugen vereisen
- **Bekijk test logs**: Controleer op specifieke test fouten
- **Voer specifieke suites uit**: Gebruik `test:unit` of `test:integration` in plaats van alle tests

### Hybride Retrieval

**Schakel Hybride Retrieval in:**
1. Stel `HYBRID_RETRIEVAL_ENABLED=true` in `.env` in
2. Stel `EMBEDDING_ENABLED=true` in om embeddings te genereren
3. Herstart de backend server

**Genereer Embeddings voor Bestaande Documenten:**
```bash
# Voer migratie script uit om embeddings te genereren voor bestaande documenten
pnpm run migrate-embeddings
```

**Controleer Embedding Status:**
```bash
# Verbind met MongoDB en controleer
mongosh "your-connection-string"
use beleidsscan
db.brondocumenten.countDocuments({ embedding: { $exists: true } })
```

**Documentatie:**
- Zie [Hybrid Retrieval Flow](./docs/01-architecture/hybrid-retrieval-flow.md) voor architectuur details
- Zie [API Documentatie](./docs/api/hybrid-retrieval.md) voor API gebruik
- Zie [Vector Storage Design](./docs/01-architecture/vector-storage-design.md) voor storage details

### Knowledge Graph Problemen

**GraphDB Verbinding:**
- Verifieer dat GraphDB draait (als je GraphDB backend gebruikt)
- Controleer `KG_BACKEND` instelling in `.env`

**Neo4j Verbinding:**
- Zorg dat Neo4j draait en toegankelijk is
- Stel `KG_BACKEND=neo4j` in `.env` in
- Verifieer Neo4j verbindingscredentials

### Workflow Problemen

**Workflow voert niet uit:**
- Controleer Redis verbinding (vereist voor workflow queue)
- Verifieer workflow definities in `src/server/workflows/`
- Controleer workflow logs via admin dashboard

**Workflow fouten:**
- Bekijk error logs in admin dashboard
- Controleer workflow action implementaties
- Verifieer externe API verbindingen (DSO, IPLO, etc.)

## Licentie

Privaat - Ruimtemeesters

## Ondersteuning

Voor problemen en vragen, neem contact op met ralph@ruimtemeesters.nl
