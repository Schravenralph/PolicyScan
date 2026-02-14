import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { t } from '../utils/i18n';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  content: React.ReactNode;
}

const tutorialTitles: Record<string, string> = {
  'getting-started': 'Aan de slag met Beleidsscan',
  'how-to-search': 'Zoekopdracht uitvoeren',
  'knowledge-network': 'Kennis Netwerk Deep Dive',
};

const tutorialDescriptions: Record<string, string> = {
  'getting-started': 'Leer de basis van Beleidsscan en ontdek hoe je het platform effectief kunt gebruiken.',
  'how-to-search': 'Leer stap voor stap hoe je een zoekopdracht uitvoert in Beleidsscan.',
  'knowledge-network': 'Ontdek hoe je het Kennis Netwerk gebruikt om relaties tussen documenten, concepten en entiteiten te verkennen.',
};

const tutorials: Record<string, TutorialStep[]> = {
  'getting-started': [
    {
      id: 'step-1',
      title: 'Welkom bij Beleidsscan',
      description: 'Maak kennis met het platform en wat het voor je kan doen.',
      content: (
        <div className="space-y-4">
          <p>Welkom bij Beleidsscan! Dit platform helpt je om beleidsdocumenten van Nederlandse overheden te vinden en te analyseren.</p>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900">
              <strong>Wat is Beleidsscan?</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-blue-800 mt-2">
              <li>Zoek en analyseer beleidsdocumenten van Rijk, Provincies en Gemeenten</li>
              <li>Vind relevante documenten op onderwerp, locatie en bestuurslaag</li>
              <li>Ontdek relaties tussen documenten via het Kennis Netwerk</li>
              <li>Monitor websites automatisch met workflows (voor developers)</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'step-2',
      title: 'Navigatie en hoofdmenu',
      description: 'Leer hoe je door het platform navigeert.',
      content: (
        <div className="space-y-4">
          <p>Het hoofdmenu aan de linkerkant geeft je toegang tot alle belangrijke functies:</p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li><strong>Zoeken:</strong> Voer zoekopdrachten uit naar beleidsdocumenten</li>
            <li><strong>Help:</strong> Toegang tot documentatie, tutorials en veelgestelde vragen</li>
            <li><strong>Workflows:</strong> Beheer geautomatiseerde scraping workflows (alleen voor developers)</li>
            <li><strong>Scan Geschiedenis:</strong> Bekijk eerdere scans en resultaten</li>
          </ul>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600">
              <strong>Tip:</strong> Gebruik het Help Center wanneer je vragen hebt of meer wilt leren over een functie.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'step-3',
      title: 'Je eerste zoekopdracht',
      description: 'Begin met zoeken naar beleidsdocumenten.',
      content: (
        <div className="space-y-4">
          <p>De zoekfunctie is de kern van Beleidsscan. Hier kun je zoeken naar beleidsdocumenten op verschillende manieren:</p>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li><strong>Onderwerp:</strong> Zoek op een specifiek onderwerp (bijv. "klimaatadaptatie")</li>
            <li><strong>Locatie:</strong> Voeg een gemeente of locatie toe om je zoekopdracht te verfijnen</li>
            <li><strong>Bestuurslaag:</strong> Filter op Rijksoverheid, Provincie, of Gemeente</li>
          </ol>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <p className="text-sm text-green-900">
              <strong>Voorbeeld:</strong> Probeer te zoeken naar "arbeidsmigranten in Horst aan de Maas" om te zien hoe de zoekfunctie werkt.
            </p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-4">
            <p className="text-sm text-gray-600">
              <strong>Volgende stap:</strong> Er is een uitgebreide tutorial beschikbaar die je stap-voor-stap door het zoekproces leidt.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'step-4',
      title: 'Help en documentatie',
      description: 'Ontdek waar je hulp kunt vinden.',
      content: (
        <div className="space-y-4">
          <p>Beleidsscan heeft uitgebreide documentatie om je te helpen:</p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li><strong>Help Center:</strong> Zoekbare artikelen georganiseerd per categorie</li>
            <li><strong>Interactieve tutorials:</strong> Stap-voor-stap gidsen voor belangrijke functies</li>
            <li><strong>Zoekfilters:</strong> Leer hoe je je zoekresultaten kunt verfijnen</li>
            <li><strong>Workflows:</strong> Handleidingen voor het maken en beheren van workflows (developers)</li>
          </ul>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900">
              <strong>{t('tutorial.tip')}</strong> Veel artikelen hebben een "{t('tutorial.startTutorial')}" knop voor interactieve begeleiding.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'step-5',
      title: 'Je bent klaar om te beginnen!',
      description: 'Samenvatting en volgende stappen.',
      content: (
        <div className="space-y-4">
          <p>Gefeliciteerd! Je hebt nu de basis van Beleidsscan geleerd.</p>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <p className="text-sm text-green-900 mb-2">
              <strong>Wat je nu kunt doen:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-green-800">
              <li>Voer je eerste zoekopdracht uit op de zoekpagina</li>
              <li>Bekijk de tutorial "Hoe voer ik een zoekopdracht uit?" voor gedetailleerde instructies</li>
              <li>Verken het Help Center voor meer informatie over specifieke functies</li>
              <li>Als developer: maak je eerste workflow om websites automatisch te monitoren</li>
            </ul>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-4">
            <p className="text-sm text-gray-600">
              <strong>Hulp nodig?</strong> Het Help Center is altijd beschikbaar via het menu. Je kunt ook zoeken naar specifieke onderwerpen of tutorials volgen voor stap-voor-stap begeleiding.
            </p>
          </div>
        </div>
      ),
    },
  ],
  'how-to-search': [
    {
      id: 'step-1',
      title: 'Stap 1: Ga naar de zoekpagina',
      description: 'Navigeer naar de zoekpagina via het menu.',
      content: (
        <div className="space-y-4">
          <p>{t('tutorial.clickSearch')}</p>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600">
              <strong>Tip:</strong> Je kunt ook direct naar <code className="bg-white px-2 py-1 rounded">/search</code> navigeren.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'step-2',
      title: 'Stap 2: Voer een onderwerp in',
      description: 'Typ je zoekterm in het onderwerp veld.',
      content: (
        <div className="space-y-4">
          <p>Voer een onderwerp in dat je wilt zoeken, bijvoorbeeld:</p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li>"arbeidsmigranten"</li>
            <li>"omgevingsvisie"</li>
            <li>"klimaatadaptatie"</li>
          </ul>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900">
              <strong>Tip:</strong> Wees specifiek in je zoekterm voor betere resultaten.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'step-3',
      title: 'Stap 3: Voeg optioneel een locatie toe',
      description: 'Specificeer een gemeente of locatie om je zoekopdracht te verfijnen.',
      content: (
        <div className="space-y-4">
          <p>Je kunt optioneel een locatie toevoegen:</p>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>Klik in het locatie veld</li>
            <li>Begin met typen van een gemeentenaam</li>
            <li>Selecteer de gemeente uit de lijst</li>
          </ol>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600">
              <strong>Voorbeeld:</strong> "arbeidsmigranten in Horst aan de Maas"
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'step-4',
      title: 'Stap 4: Kies een bestuurslaag (optioneel)',
      description: 'Filter op Rijksoverheid, Provincie, of Gemeente.',
      content: (
        <div className="space-y-4">
          <p>Selecteer een bestuurslaag om je zoekresultaten te filteren:</p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li><strong>Rijksoverheid:</strong> Nationaal beleid</li>
            <li><strong>Provincie:</strong> Provinciaal beleid</li>
            <li><strong>Gemeente:</strong> Lokaal beleid</li>
            <li><strong>Alle bestuurslagen:</strong> Geen filter (standaard)</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'step-5',
      title: 'Stap 5: Voer de zoekopdracht uit',
      description: t('tutorial.clickSearchToView'),
      content: (
        <div className="space-y-4">
          <p>{t('tutorial.clickSearchButton')}</p>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <p className="text-sm text-green-900">
              <strong>Gefeliciteerd!</strong> Je hebt nu geleerd hoe je een zoekopdracht uitvoert.
            </p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-4">
            <p className="text-sm text-gray-600">
              <strong>Volgende stappen:</strong> Probeer verschillende combinaties van onderwerp, locatie en bestuurslaag om te zien hoe de resultaten veranderen.
            </p>
          </div>
        </div>
      ),
    },
  ],
  'knowledge-network': [
    {
      id: 'step-1',
      title: 'Wat is het Kennis Netwerk?',
      description: 'Maak kennis met het Kennis Netwerk en wat het voor je kan doen.',
      content: (
        <div className="space-y-4">
          <p>Het Kennis Netwerk is een visuele weergave van alle relaties tussen beleidsdocumenten, concepten en entiteiten in Beleidsscan. Het helpt je om:</p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li><strong>Relaties ontdekken:</strong> Zie hoe documenten, regelgevingen en concepten met elkaar verbonden zijn</li>
            <li><strong>Patronen vinden:</strong> Identificeer clusters en gemeenschappen van gerelateerde onderwerpen</li>
            <li><strong>Navigeren:</strong> Spring tussen gerelateerde documenten en concepten</li>
            <li><strong>Analyseren:</strong> Begrijp de structuur en hiërarchie van beleidsinformatie</li>
          </ul>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900">
              <strong>Tip:</strong> Het Kennis Netwerk gebruikt graph database technologie (GraphDB of Neo4j) om complexe relaties efficiënt weer te geven en te doorzoeken.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'step-2',
      title: 'Nodes en Edges begrijpen',
      description: 'Leer wat de elementen in de visualisatie betekenen.',
      content: (
        <div className="space-y-4">
          <p>Het Kennis Netwerk bestaat uit twee hoofdcomponenten:</p>
          <div className="space-y-3">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <p className="font-semibold text-gray-900 mb-2">Nodes (Knooppunten)</p>
              <p className="text-sm text-gray-700 mb-2">Nodes vertegenwoordigen entiteiten zoals:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 ml-2">
                <li><strong>PolicyDocument:</strong> Beleidsdocumenten van overheden</li>
                <li><strong>Regulation:</strong> Regelgevingen en wetten</li>
                <li><strong>SpatialUnit:</strong> Geografische eenheden (gemeenten, provincies)</li>
                <li><strong>LandUse:</strong> Bestemmingsplannen en ruimtelijke ordening</li>
                <li><strong>Requirement:</strong> Vereisten en normen</li>
                <li><strong>Clusters:</strong> Groepen van gerelateerde entiteiten</li>
              </ul>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <p className="font-semibold text-gray-900 mb-2">Edges (Verbindingen)</p>
              <p className="text-sm text-gray-700 mb-2">Edges tonen relaties tussen entiteiten:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 ml-2">
                <li><strong>RELATES_TO:</strong> Algemene relatie tussen concepten</li>
                <li><strong>IMPLEMENTS:</strong> Een document implementeert een regelgeving</li>
                <li><strong>APPLIES_TO:</strong> Regelgeving geldt voor een gebied</li>
                <li><strong>DEFINES:</strong> Een document definieert een concept</li>
                <li><strong>REFERENCES:</strong> Een document verwijst naar een ander document</li>
              </ul>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'step-3',
      title: 'Navigeren in de visualisatie',
      description: 'Leer hoe je door het netwerk beweegt en interacteert.',
      content: (
        <div className="space-y-4">
          <p>Het Kennis Netwerk is volledig interactief. Hier zijn de belangrijkste interacties:</p>
          <ol className="list-decimal list-inside space-y-3 text-gray-700">
            <li>
              <strong>Pannen:</strong> Klik en sleep om door het netwerk te bewegen
            </li>
            <li>
              <strong>Zoomen:</strong> Gebruik je muiswiel of pinch-to-zoom om in en uit te zoomen
            </li>
            <li>
              <strong>Klikken op nodes:</strong> Klik op een node om details te zien:
              <ul className="list-disc list-inside ml-4 mt-1 text-sm text-gray-600">
                <li>Voor clusters: zie de entiteiten binnen het cluster</li>
                <li>Voor individuele entiteiten: zie metadata en relaties</li>
              </ul>
            </li>
            <li>
              <strong>Layout wisselen:</strong> Gebruik de layout-knoppen om te schakelen tussen:
              <ul className="list-disc list-inside ml-4 mt-1 text-sm text-gray-600">
                <li><strong>Hierarchisch:</strong> Toont hiërarchische structuren (standaard)</li>
                <li><strong>Force-directed:</strong> Toont natuurlijke clustering op basis van connectiviteit</li>
              </ul>
            </li>
          </ol>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <p className="text-sm text-green-900">
              <strong>Probeer het uit:</strong> Ga naar het Kennis Netwerk en klik op verschillende nodes om te zien wat er gebeurt!
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'step-4',
      title: 'Filters en domeinen gebruiken',
      description: 'Leer hoe je de visualisatie kunt filteren op domeinen.',
      content: (
        <div className="space-y-4">
          <p>Het Kennis Netwerk bevat veel informatie. Filters helpen je om te focussen op wat relevant is:</p>
          <div className="space-y-3">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="font-semibold text-blue-900 mb-2">Domein Filters</p>
              <p className="text-sm text-blue-800 mb-2">Filter nodes op domein (bijvoorbeeld "ruimtelijke ordening", "milieu", "verkeer"):</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-blue-700 ml-2">
                <li>Selecteer één of meerdere domeinen in het filter menu</li>
                <li>Alleen nodes van geselecteerde domeinen worden getoond</li>
                <li>Gebruik "ALL" om alle domeinen te tonen</li>
              </ul>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <p className="font-semibold text-gray-900 mb-2">Domein Kleuring</p>
              <p className="text-sm text-gray-700">
                Activeer "Kleur op domein" om nodes visueel te groeperen op basis van hun domein. Dit maakt het makkelijker om patronen te zien.
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <p className="font-semibold text-gray-900 mb-2">Legenda en Statistieken</p>
              <p className="text-sm text-gray-700">
                Gebruik de legenda om te zien welke kleuren bij welke domeinen horen, en bekijk statistieken om een overzicht te krijgen van de verdeling van entiteiten over domeinen.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'step-5',
      title: 'Clusters en gemeenschappen verkennen',
      description: 'Ontdek hoe clusters je helpen om gerelateerde entiteiten te vinden.',
      content: (
        <div className="space-y-4">
          <p>Clusters zijn groepen van gerelateerde entiteiten. Ze helpen je om:</p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li><strong>Gerelateerde documenten vinden:</strong> Entiteiten in hetzelfde cluster zijn vaak thematisch verbonden</li>
            <li><strong>Overzicht behouden:</strong> In plaats van honderden individuele nodes zie je georganiseerde groepen</li>
            <li><strong>Patronen ontdekken:</strong> Clusters kunnen thema's, domeinen of conceptuele gemeenschappen vertegenwoordigen</li>
          </ul>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900 mb-2">
              <strong>Hoe clusters te gebruiken:</strong>
            </p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 ml-2">
              <li>Klik op een cluster node om het uit te klappen</li>
              <li>Bekijk de lijst van entiteiten binnen het cluster</li>
              <li>Gebruik paginering om door grote clusters te navigeren</li>
              <li>Klik op een individuele entiteit om details te zien</li>
            </ol>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600">
              <strong>Tip:</strong> Clusters kunnen worden gegenereerd op basis van verschillende algoritmes (Louvain, Leiden, etc.) of op basis van entiteit types en domeinen.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'step-6',
      title: 'Entity metadata en relaties lezen',
      description: 'Leer hoe je gedetailleerde informatie over entiteiten bekijkt.',
      content: (
        <div className="space-y-4">
          <p>Wanneer je op een entiteit klikt, krijg je toegang tot uitgebreide metadata:</p>
          <div className="space-y-3">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <p className="font-semibold text-gray-900 mb-2">Basis Informatie</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-2">
                <li><strong>Naam:</strong> De naam van de entiteit</li>
                <li><strong>Type:</strong> Het type entiteit (PolicyDocument, Regulation, etc.)</li>
                <li><strong>Beschrijving:</strong> Een beschrijving van de entiteit</li>
                <li><strong>URL:</strong> Link naar de bron (indien beschikbaar)</li>
              </ul>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <p className="font-semibold text-gray-900 mb-2">Relaties</p>
              <p className="text-sm text-gray-700 mb-2">Zie alle relaties die deze entiteit heeft:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 ml-2">
                <li>Welke andere entiteiten zijn verbonden</li>
                <li>Wat voor type relatie het is</li>
                <li>Navigeer naar gerelateerde entiteiten</li>
              </ul>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="font-semibold text-blue-900 mb-2">Graph Metrics (indien beschikbaar)</p>
              <p className="text-sm text-blue-800 mb-2">Voor geavanceerde analyse kunnen entiteiten metrics bevatten zoals:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-blue-700 ml-2">
                <li><strong>PageRank:</strong> Belangrijkheid in het netwerk</li>
                <li><strong>Betweenness:</strong> Centraliteit (belangrijke verbindingspunten)</li>
                <li><strong>Degree:</strong> Aantal directe verbindingen</li>
                <li><strong>Community ID:</strong> Welke cluster/gemeenschap de entiteit behoort</li>
              </ul>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'step-7',
      title: 'Patronen ontdekken en analyseren',
      description: 'Leer hoe je het Kennis Netwerk gebruikt voor analyse.',
      content: (
        <div className="space-y-4">
          <p>Het Kennis Netwerk is krachtig voor het ontdekken van patronen in beleidsinformatie:</p>
          <div className="space-y-3">
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <p className="font-semibold text-green-900 mb-2">Veelvoorkomende patronen</p>
              <ul className="list-disc list-inside space-y-2 text-sm text-green-800 ml-2">
                <li><strong>Hub nodes:</strong> Entiteiten met veel verbindingen zijn vaak centrale concepten of belangrijke documenten</li>
                <li><strong>Clusters:</strong> Dicht verbonden groepen kunnen thematische gebieden of gerelateerde regelgevingen vertegenwoordigen</li>
                <li><strong>Hiërarchieën:</strong> In hierarchische layout zie je hoe documenten en regelgevingen zich tot elkaar verhouden</li>
                <li><strong>Cross-domein verbindingen:</strong> Entiteiten die domeinen verbinden zijn vaak interdisciplinair relevant</li>
              </ul>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="font-semibold text-blue-900 mb-2">Analyse strategieën</p>
              <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800 ml-2">
                <li><strong>Begin breed:</strong> Bekijk het hele netwerk om een overzicht te krijgen</li>
                <li><strong>Filter op interesse:</strong> Gebruik domein filters om te focussen op relevante gebieden</li>
                <li><strong>Verkennen:</strong> Klik op interessante clusters of nodes om dieper te graven</li>
                <li><strong>Volg verbindingen:</strong> Gebruik relaties om tussen gerelateerde documenten te navigeren</li>
                <li><strong>Vergelijk layouts:</strong> Wissel tussen hierarchisch en force-directed om verschillende aspecten te zien</li>
              </ol>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600">
                <strong>Tip:</strong> Gebruik de metrics dashboard (indien beschikbaar) om statistieken te zien over het netwerk, zoals het aantal entiteiten per type, de verdeling over domeinen, en belangrijke metrics zoals PageRank.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'step-8',
      title: 'Je bent klaar!',
      description: 'Samenvatting en volgende stappen.',
      content: (
        <div className="space-y-4">
          <p>Gefeliciteerd! Je hebt nu geleerd hoe je het Kennis Netwerk gebruikt.</p>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <p className="text-sm text-green-900 mb-2">
              <strong>Wat je nu kunt doen:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-green-800">
              <li>Ga naar het Kennis Netwerk en verken de visualisatie</li>
              <li>Experimenteer met verschillende layouts en filters</li>
              <li>Klik op clusters en entiteiten om details te bekijken</li>
              <li>Gebruik het netwerk om gerelateerde documenten te vinden</li>
              <li>Ontdek patronen en relaties in beleidsinformatie</li>
            </ul>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900 mb-2">
              <strong>Geavanceerde functies:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
              <li>Gebruik de metrics dashboard voor diepgaande analyse</li>
              <li>Experimenteer met verschillende clustering algoritmes</li>
              <li>Verken cross-domein verbindingen voor interdisciplinair onderzoek</li>
            </ul>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-4">
            <p className="text-sm text-gray-600">
              <strong>Hulp nodig?</strong> Het Help Center is altijd beschikbaar via het menu. Je kunt ook terugkomen naar deze tutorial wanneer je maar wilt.
            </p>
          </div>
        </div>
      ),
    },
  ],
};

export function TutorialPage() {
  const { tutorialId } = useParams<{ tutorialId: string }>();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  if (!tutorialId || !tutorials[tutorialId]) {
    return (
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-600">{t('tutorial.notFound')}</p>
            <Button onClick={() => navigate('/help')} className="mt-4">
              {t('tutorial.backToHelpCenter')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tutorialSteps = tutorials[tutorialId];
  const currentStepData = tutorialSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tutorialSteps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      navigate('/help');
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/help')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('tutorial.backToHelpCenter')}
        </Button>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {t('tutorial.title')} {tutorialTitles[tutorialId] || t('tutorial.fallback')}
        </h1>
        <p className="text-gray-600">
          {tutorialDescriptions[tutorialId] || 'Volg deze tutorial om meer te leren.'}
        </p>
      </div>

      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">
            Stap {currentStep + 1} van {tutorialSteps.length}
          </span>
          <Badge variant="secondary">
            {Math.round(((currentStep + 1) / tutorialSteps.length) * 100)}% voltooid
          </Badge>
        </div>
        <div className="flex gap-2">
          {tutorialSteps.map((_, index) => (
            <div
              key={index}
              className={`h-2 flex-1 rounded transition-colors ${
                index <= currentStep ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Current step content */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-2xl">{currentStepData.title}</CardTitle>
          <p className="text-gray-600 mt-2">{currentStepData.description}</p>
        </CardHeader>
        <CardContent className="prose max-w-none">
          {currentStepData.content}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={isFirstStep}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Vorige
        </Button>
        <Button onClick={handleNext}>
          {isLastStep ? t('tutorial.complete') : t('tutorial.next')}
          {!isLastStep && <ArrowRight className="w-4 h-4 ml-2" />}
        </Button>
      </div>
    </div>
  );
}

