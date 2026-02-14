# ETL Pipeline Structure

This directory contains ETL (Extract, Transform, Load) pipelines for loading data into GraphDB.

## Architecture

The ETL pipelines follow this flow:

```
Data Sources → Extract → Transform → RDF → Load → GraphDB
```

### Data Sources

1. **DSO Stelselcatalogus** - REST API → SKOS concepts
2. **Official Geodata** - PDOK/BAG/CBS → PostGIS → simplified WKT → GraphDB
3. **Legal & Information Sites** - Scraped HTML → cleaned text → NLP extraction → RDF
4. **Municipal Systems** - GGM schemas → RDF mappings → GraphDB

### Pipeline Stages

#### 1. Extract
- HTTP requests (DSO APIs)
- Database queries (PostGIS, MongoDB)
- File reading (scraped HTML, JSON)

#### 2. Transform
- Text cleaning (trafilatura, BeautifulSoup)
- NLP extraction (spaCy with Dutch model)
- RDF conversion (JSON facts → Turtle/RDF)

#### 3. Load
- SPARQL UPDATE queries
- RDF bulk loading
- Named graph assignment

## Directory Structure

```
etl/
├── extractors/          # Data extraction modules
│   ├── dsoExtractor.ts  # DSO Stelselcatalogus
│   ├── geodataExtractor.ts  # PostGIS/BAG/CBS
│   └── scraperExtractor.ts  # Web scraping
├── transformers/       # Data transformation modules
│   ├── nlpExtractor.ts  # spaCy NLP → RDF facts
│   ├── rdfConverter.ts  # JSON → Turtle
│   └── geodataTransformer.ts  # PostGIS → GeoSPARQL
├── loaders/            # GraphDB loading modules
│   └── graphdbLoader.ts  # RDF → GraphDB
└── pipelines/         # Complete pipeline workflows
    ├── dsoPipeline.ts  # DSO vocab ETL
    ├── geodataPipeline.ts  # Geodata ETL
    └── scraperPipeline.ts  # Scraper → KG pipeline
```

## Usage

Run individual pipelines:

```bash
pnpm run etl:dso          # Load DSO Stelselcatalogus
pnpm run etl:geodata     # Load geodata from PostGIS
pnpm run etl:scraper     # Process scraped documents
```

## Example: Loading DSO Vocabulary

See `pipelines/dsoPipeline.ts` for a complete example.

