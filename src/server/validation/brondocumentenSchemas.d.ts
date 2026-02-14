import { z } from 'zod';
/**
 * @deprecated Legacy schema for backward compatibility. Use CanonicalDocumentService and canonicalDocumentSchemas instead.
 * @see src/server/validation/canonicalDocumentSchemas.ts
 * @see WI-415: Backend Cleanup & Transformation Removal
 */
export declare const bronDocumentSchemas: {
    create: {
        body: z.ZodObject<{
            titel: z.ZodString;
            url: z.ZodString;
            website_url: z.ZodString;
            samenvatting: z.ZodOptional<z.ZodString>;
            'relevantie voor zoekopdracht': z.ZodOptional<z.ZodString>;
            type_document: z.ZodOptional<z.ZodEnum<{
                PDF: "PDF";
                Omgevingsvisie: "Omgevingsvisie";
                Omgevingsplan: "Omgevingsplan";
                Bestemmingsplan: "Bestemmingsplan";
                Structuurvisie: "Structuurvisie";
                Beleidsregel: "Beleidsregel";
                Beleidsnota: "Beleidsnota";
                Verordening: "Verordening";
                Visiedocument: "Visiedocument";
                Rapport: "Rapport";
                Besluit: "Besluit";
                Beleidsdocument: "Beleidsdocument";
                Webpagina: "Webpagina";
            }>>;
            documentFamily: z.ZodOptional<z.ZodEnum<{
                Web: "Web";
                Omgevingsinstrument: "Omgevingsinstrument";
                Juridisch: "Juridisch";
                Beleid: "Beleid";
                Geo: "Geo";
                Other: "Other";
            }>>;
            documentType: z.ZodOptional<z.ZodEnum<{
                unknown: "unknown";
                news: "news";
                rapport: "rapport";
                verordening: "verordening";
                omgevingsvisie: "omgevingsvisie";
                omgevingsplan: "omgevingsplan";
                bestemmingsplan: "bestemmingsplan";
                structuurvisie: "structuurvisie";
                besluit: "besluit";
                omgevingsprogramma: "omgevingsprogramma";
                omgevingsverordening: "omgevingsverordening";
                voorbereidingsbesluit: "voorbereidingsbesluit";
                projectbesluit: "projectbesluit";
                wet: "wet";
                amvb: "amvb";
                regeling: "regeling";
                beleidsregel: "beleidsregel";
                uitspraak: "uitspraak";
                beleidsnota: "beleidsnota";
                nota: "nota";
                visiedocument: "visiedocument";
                visie: "visie";
                beleidsdocument: "beleidsdocument";
                webpagina: "webpagina";
                webpage: "webpage";
                "landing-page": "landing-page";
                faq: "faq";
                "pdok-layer": "pdok-layer";
                "pdok-service": "pdok-service";
                "pdok-dataset": "pdok-dataset";
                workingsgebied: "workingsgebied";
                gio: "gio";
                factsheet: "factsheet";
                guide: "guide";
                summary: "summary";
                research: "research";
            }>>;
            queryId: z.ZodOptional<z.ZodString>;
            accepted: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
            subjects: z.ZodOptional<z.ZodArray<z.ZodString>>;
            themes: z.ZodOptional<z.ZodArray<z.ZodString>>;
            label: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
    };
    createMany: {
        body: z.ZodArray<z.ZodObject<{
            titel: z.ZodString;
            url: z.ZodString;
            website_url: z.ZodString;
            samenvatting: z.ZodOptional<z.ZodString>;
            'relevantie voor zoekopdracht': z.ZodOptional<z.ZodString>;
            type_document: z.ZodOptional<z.ZodEnum<{
                PDF: "PDF";
                Omgevingsvisie: "Omgevingsvisie";
                Omgevingsplan: "Omgevingsplan";
                Bestemmingsplan: "Bestemmingsplan";
                Structuurvisie: "Structuurvisie";
                Beleidsregel: "Beleidsregel";
                Beleidsnota: "Beleidsnota";
                Verordening: "Verordening";
                Visiedocument: "Visiedocument";
                Rapport: "Rapport";
                Besluit: "Besluit";
                Beleidsdocument: "Beleidsdocument";
                Webpagina: "Webpagina";
            }>>;
            documentFamily: z.ZodOptional<z.ZodEnum<{
                Web: "Web";
                Omgevingsinstrument: "Omgevingsinstrument";
                Juridisch: "Juridisch";
                Beleid: "Beleid";
                Geo: "Geo";
                Other: "Other";
            }>>;
            documentType: z.ZodOptional<z.ZodEnum<{
                unknown: "unknown";
                news: "news";
                rapport: "rapport";
                verordening: "verordening";
                omgevingsvisie: "omgevingsvisie";
                omgevingsplan: "omgevingsplan";
                bestemmingsplan: "bestemmingsplan";
                structuurvisie: "structuurvisie";
                besluit: "besluit";
                omgevingsprogramma: "omgevingsprogramma";
                omgevingsverordening: "omgevingsverordening";
                voorbereidingsbesluit: "voorbereidingsbesluit";
                projectbesluit: "projectbesluit";
                wet: "wet";
                amvb: "amvb";
                regeling: "regeling";
                beleidsregel: "beleidsregel";
                uitspraak: "uitspraak";
                beleidsnota: "beleidsnota";
                nota: "nota";
                visiedocument: "visiedocument";
                visie: "visie";
                beleidsdocument: "beleidsdocument";
                webpagina: "webpagina";
                webpage: "webpage";
                "landing-page": "landing-page";
                faq: "faq";
                "pdok-layer": "pdok-layer";
                "pdok-service": "pdok-service";
                "pdok-dataset": "pdok-dataset";
                workingsgebied: "workingsgebied";
                gio: "gio";
                factsheet: "factsheet";
                guide: "guide";
                summary: "summary";
                research: "research";
            }>>;
            queryId: z.ZodOptional<z.ZodString>;
            accepted: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
            subjects: z.ZodOptional<z.ZodArray<z.ZodString>>;
            themes: z.ZodOptional<z.ZodArray<z.ZodString>>;
            label: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    };
    getById: {
        params: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
    };
    getByQuery: {
        params: z.ZodObject<{
            queryId: z.ZodString;
        }, z.core.$strip>;
    };
    getByWebsite: {
        query: z.ZodObject<{
            url: z.ZodString;
        }, z.core.$loose>;
    };
    update: {
        params: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
        body: z.ZodObject<{
            titel: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            website_url: z.ZodOptional<z.ZodString>;
            samenvatting: z.ZodOptional<z.ZodString>;
            'relevantie voor zoekopdracht': z.ZodOptional<z.ZodString>;
            type_document: z.ZodOptional<z.ZodEnum<{
                PDF: "PDF";
                Omgevingsvisie: "Omgevingsvisie";
                Omgevingsplan: "Omgevingsplan";
                Bestemmingsplan: "Bestemmingsplan";
                Structuurvisie: "Structuurvisie";
                Beleidsregel: "Beleidsregel";
                Beleidsnota: "Beleidsnota";
                Verordening: "Verordening";
                Visiedocument: "Visiedocument";
                Rapport: "Rapport";
                Besluit: "Besluit";
                Beleidsdocument: "Beleidsdocument";
                Webpagina: "Webpagina";
            }>>;
            documentFamily: z.ZodOptional<z.ZodEnum<{
                Web: "Web";
                Omgevingsinstrument: "Omgevingsinstrument";
                Juridisch: "Juridisch";
                Beleid: "Beleid";
                Geo: "Geo";
                Other: "Other";
            }>>;
            documentType: z.ZodOptional<z.ZodEnum<{
                unknown: "unknown";
                news: "news";
                rapport: "rapport";
                verordening: "verordening";
                omgevingsvisie: "omgevingsvisie";
                omgevingsplan: "omgevingsplan";
                bestemmingsplan: "bestemmingsplan";
                structuurvisie: "structuurvisie";
                besluit: "besluit";
                omgevingsprogramma: "omgevingsprogramma";
                omgevingsverordening: "omgevingsverordening";
                voorbereidingsbesluit: "voorbereidingsbesluit";
                projectbesluit: "projectbesluit";
                wet: "wet";
                amvb: "amvb";
                regeling: "regeling";
                beleidsregel: "beleidsregel";
                uitspraak: "uitspraak";
                beleidsnota: "beleidsnota";
                nota: "nota";
                visiedocument: "visiedocument";
                visie: "visie";
                beleidsdocument: "beleidsdocument";
                webpagina: "webpagina";
                webpage: "webpage";
                "landing-page": "landing-page";
                faq: "faq";
                "pdok-layer": "pdok-layer";
                "pdok-service": "pdok-service";
                "pdok-dataset": "pdok-dataset";
                workingsgebied: "workingsgebied";
                gio: "gio";
                factsheet: "factsheet";
                guide: "guide";
                summary: "summary";
                research: "research";
            }>>;
            accepted: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
            subjects: z.ZodOptional<z.ZodArray<z.ZodString>>;
            themes: z.ZodOptional<z.ZodArray<z.ZodString>>;
            label: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
    };
    updateAcceptance: {
        params: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
        body: z.ZodObject<{
            accepted: z.ZodNullable<z.ZodBoolean>;
        }, z.core.$strip>;
    };
    delete: {
        params: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
    };
};
