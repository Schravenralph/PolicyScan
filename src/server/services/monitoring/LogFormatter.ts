import { RunLog } from '../infrastructure/types.js';

export interface FormattedLog {
    id: string;
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    formattedMessage: string;
    thoughtBubble?: string;
    metadata?: Record<string, unknown>;
    color: string;
    icon: string;
}

/**
 * Service for formatting logs into user-facing "workflow thoughts"
 * 
 * IMPORTANT: This formatter is ONLY used when sending logs to the frontend.
 * It transforms raw debugging/tracing logs into user-friendly "workflow thoughts"
 * that explain the reasoning and decision-making process (ChatGPT-style).
 * 
 * The original raw logs remain unchanged in MongoDB and log files for
 * debugging/tracing purposes. This formatter does NOT modify stored logs.
 */
export class LogFormatter {
    private runParams?: Record<string, unknown>;

    /**
     * Set run parameters for context-aware formatting
     */
    setRunParams(params: Record<string, unknown>): void {
        this.runParams = params;
    }

    /**
     * Format a single log entry into a prettier format
     */
    formatLog(log: RunLog, index: number): FormattedLog {
        // Handle various timestamp formats (Date object, ISO string, timestamp number)
        let timestamp: Date;
        if (log.timestamp instanceof Date) {
            timestamp = log.timestamp;
        } else if (typeof log.timestamp === 'string') {
            timestamp = new Date(log.timestamp);
        } else if (typeof log.timestamp === 'number') {
            timestamp = new Date(log.timestamp);
        } else {
            // Fallback to current time if invalid
            timestamp = new Date();
        }
        
        // Validate timestamp
        if (isNaN(timestamp.getTime())) {
            timestamp = new Date();
        }
        
        const formattedTime = timestamp.toLocaleTimeString('nl-NL', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const { formattedMessage, thoughtBubble } = this.formatMessage(log.message, log.level, this.runParams);
        const { color, icon } = this.getLevelStyle(log.level);

        return {
            id: `log-${index}-${timestamp.getTime()}`,
            timestamp: formattedTime,
            level: log.level,
            message: log.message,
            formattedMessage,
            thoughtBubble,
            metadata: log.metadata,
            color,
            icon
        };
    }

    /**
     * Format multiple logs
     */
    formatLogs(logs: RunLog[]): FormattedLog[] {
        return logs.map((log, index) => this.formatLog(log, index));
    }

    /**
     * Format message with thought bubbles and color coding
     */
    private formatMessage(message: string, level: string, runParams?: Record<string, unknown>): { formattedMessage: string; thoughtBubble?: string } {
        
        // Step execution messages
        if (message.startsWith('Executing step:')) {
            const stepName = message.replace('Executing step:', '').trim();
            const actionMatch = message.match(/\((.+)\)/);
            const action = actionMatch?.[1] || '';
            // Extract step number if present in stepName
            const stepNumberMatch = stepName.match(/^(\d+):\s*(.+)/);
            const stepNumber = stepNumberMatch?.[1];
            const cleanStepName = stepNumberMatch?.[2] || stepName;
            
            // Infer purpose and action description synchronously
            const stepLower = cleanStepName.toLowerCase();
            const actionLower = action?.toLowerCase() || '';
            let purpose = 'de workflow voort te zetten';
            if (stepLower.includes('scan') || stepLower.includes('zoek') || actionLower.includes('search')) {
                purpose = 'relevante documenten en informatie te vinden';
            } else if (stepLower.includes('explore') || stepLower.includes('verkenn') || actionLower.includes('explore')) {
                purpose = 'nieuwe pagina\'s en verbindingen te ontdekken';
            } else if (stepLower.includes('filter') || stepLower.includes('score') || actionLower.includes('filter')) {
                purpose = 'de meest relevante resultaten te identificeren';
            } else if (stepLower.includes('enrich') || stepLower.includes('verrijk') || actionLower.includes('enrich')) {
                purpose = 'documenten te verrijken met volledige tekst, regels, activiteiten en regelingsgebieden om gestructureerde zoekopdrachten en betere documentanalyse mogelijk te maken';
            }
            
            let actionDesc = action || cleanStepName;
            if (actionLower.includes('search_dso')) {
                actionDesc = 'zoeken in de DSO Omgevingsdocumenten database';
            } else if (actionLower.includes('search_iplo')) {
                actionDesc = 'zoeken in de IPLO beleidsdocumentendatabase';
            } else if (actionLower.includes('scan_known')) {
                actionDesc = 'geselecteerde websites te scannen';
            } else if (actionLower.includes('enrich_dso') || (stepLower.includes('enrich') && stepLower.includes('dso'))) {
                actionDesc = 'de top-K documenten te downloaden en verrijken met volledige tekst, regels, activiteiten en regelingsgebieden';
            }
            
            return {
                formattedMessage: stepNumber 
                    ? `Stap ${stepNumber}: ${cleanStepName} - ${purpose}. We gaan nu ${actionDesc} uitvoeren.`
                    : `${cleanStepName} - ${purpose}. We gaan nu ${actionDesc} uitvoeren.`,
                thoughtBubble: action 
                    ? `Ik start nu met "${cleanStepName}" om ${actionDesc} uit te voeren.`
                    : `Ik start nu met de stap "${cleanStepName}".`
            };
        }

        // Step completion
        if (message.startsWith('Step completed:')) {
            const stepName = message.replace('Step completed:', '').trim();
            // Try to extract action from step name if it follows the pattern "StepName (action)"
            const actionMatch = stepName.match(/\((.+)\)/);
            const action = actionMatch?.[1] || '';
            const cleanStepName = actionMatch ? stepName.replace(/\s*\(.+\)/, '').trim() : stepName;
            
            // Generate context-specific thought bubble based on common step actions
            let thoughtBubble: string;
            if (action) {
                // Map common actions to more specific completion messages
                const actionLower = action.toLowerCase();
                if (actionLower.includes('scan') || actionLower.includes('zoek')) {
                    thoughtBubble = `Ik heb "${cleanStepName}" voltooid. De scan heeft relevante documenten en informatie gevonden die nu beschikbaar zijn voor verdere analyse.`;
                } else if (actionLower.includes('explore') || actionLower.includes('verkenn')) {
                    thoughtBubble = `Ik heb "${cleanStepName}" voltooid. De verkenning heeft nieuwe pagina's en verbindingen ontdekt die nu beschikbaar zijn voor de volgende stap.`;
                } else if (actionLower.includes('filter') || actionLower.includes('filter')) {
                    thoughtBubble = `Ik heb "${cleanStepName}" voltooid. De gefilterde resultaten zijn nu beschikbaar en klaar voor verdere verwerking.`;
                } else if (actionLower.includes('analyze') || actionLower.includes('analyseer')) {
                    thoughtBubble = `Ik heb "${cleanStepName}" voltooid. De analyse is afgerond en de inzichten zijn beschikbaar voor de volgende stap.`;
                } else if (actionLower.includes('extract') || actionLower.includes('extraheer')) {
                    thoughtBubble = `Ik heb "${cleanStepName}" voltooid. De geëxtraheerde informatie is nu beschikbaar voor verdere verwerking.`;
                } else {
                    thoughtBubble = `Ik heb "${cleanStepName}" voltooid (${action}). De resultaten zijn beschikbaar voor de volgende stap.`;
                }
            } else {
                thoughtBubble = `Stap "${cleanStepName}" voltooid. Resultaten zijn beschikbaar voor de volgende stap.`;
            }
            
            return {
                formattedMessage: `Stap voltooid: ${cleanStepName}`,
                thoughtBubble
            };
        }

        // Step failure
        if (message.startsWith('Step failed:')) {
            const parts = message.replace('Step failed:', '').split(' - ');
            const stepName = parts[0].trim();
            const error = parts[1]?.trim() || 'Onbekende fout';
            return {
                formattedMessage: `Stap mislukt: ${stepName} - ${error}`,
                thoughtBubble: `Er is een fout opgetreden tijdens de uitvoering van "${stepName}": ${error}. Ik zal proberen door te gaan met de workflow waar mogelijk, maar deze stap heeft geen resultaten opgeleverd. Als dit een kritieke stap was, kan dit de workflow beïnvloeden.`
            };
        }

        // Run status messages
        if (message.includes('Run started') || message.includes('Run gestart') || message.includes('Workflowuitvoering gestart')) {
            // Extract query and location information from run params if available
            const query = runParams?.onderwerp || runParams?.query || runParams?.thema;
            const location = runParams?.overheidsinstantie || runParams?.overheidslaag || runParams?.overheidstype;

            // Build a smooth, user-friendly message
            let thoughtBubble = 'Ik start de workflow. ';

            if (query && location) {
                const queryStr = typeof query === 'string' ? query : String(query);
                const locationStr = typeof location === 'string' ? location : String(location);
                thoughtBubble += `Je hebt gevraagd om informatie over "${queryStr}" voor ${locationStr}. `;
            } else if (query) {
                const queryStr = typeof query === 'string' ? query : String(query);
                thoughtBubble += `Je hebt gevraagd om informatie over "${queryStr}". `;
            } else if (location) {
                const locationStr = typeof location === 'string' ? location : String(location);
                thoughtBubble += `Je hebt gevraagd om informatie voor ${locationStr}. `;
            }

            thoughtBubble += 'Ik voer elke stap sequentieel uit en gebruik de resultaten om de volgende stap te informeren.';

            return {
                formattedMessage: 'Workflowuitvoering gestart',
                thoughtBubble
            };
        }

        if (message.includes('Run completed successfully') || message.includes('Workflow completed successfully')) {
            return {
                formattedMessage: 'Workflow succesvol voltooid',
                thoughtBubble: 'Workflow voltooid! Alle stappen zijn succesvol uitgevoerd. De resultaten zijn klaar voor beoordeling.'
            };
        }

        if (message.includes('Run failed:') || message.includes('Workflow failed:')) {
            const error = message.replace(/^(Run|Workflow) failed:\s*/, '').trim();
            return {
                formattedMessage: `Workflow mislukt: ${error}`,
                thoughtBubble: `De workflow heeft een kritieke fout ondervonden: ${error}. Dit betekent dat de workflow niet volledig kon worden uitgevoerd. De fout kan verschillende oorzaken hebben, zoals netwerkproblemen, ongeldige configuratie, of onvoldoende toegang tot bepaalde bronnen. Controleer de instellingen en probeer het opnieuw.`
            };
        }

        // Semantic targeting
        if (message.includes('Semantic targeting')) {
            const query = message.match(/"([^"]+)"/)?.[1] || 'query';
            return {
                formattedMessage: message,
                thoughtBubble: `Ik analyseer "${query}" om te begrijpen wat u echt zoekt. Dit helpt me om de zoekopdracht te richten op inhoud die daadwerkelijk relevant is, in plaats van alleen op trefwoorden te matchen. Ik gebruik dit begrip om te bepalen welke pagina's en documenten ik moet verkennen. Door de context en betekenis te begrijpen, kan ik veel gerichter zoeken dan met een simpele trefwoordmatch.`
            };
        }

        // Cluster identification
        if (message.includes('Identified') && message.includes('clusters')) {
            const count = message.match(/(\d+)\s+relevant clusters/)?.[1] || message.match(/(\d+)/)?.[1] || 'meerdere';
            // Match cluster labels (which may contain spaces, commas, and other characters)
            // Pattern matches: "clusters: Label1, Label2, Label3" or "clusters: Label1"
            const clusterMatch = message.match(/clusters:\s*(.+?)(?:\s*$)/)?.[1] || '';
            const clusterLabels = clusterMatch.trim();
            return {
                formattedMessage: message,
                thoughtBubble: clusterLabels 
                    ? `Ik heb ${count} inhoudsclusters geïdentificeerd die semantisch gerelateerd zijn aan de zoekopdracht. Deze clusters (${clusterLabels}) vertegenwoordigen groepen pagina's die vergelijkbare onderwerpen bespreken. Dit betekent dat ik mijn verkenning kan richten op deze gebieden in plaats van willekeurig te browsen, wat veel efficiënter en relevanter zal zijn. Door me te concentreren op deze clusters, kan ik sneller de meest relevante informatie vinden.`
                    : `Ik heb ${count} inhoudsclusters geïdentificeerd die semantisch gerelateerd zijn aan de zoekopdracht. Deze clusters vertegenwoordigen groepen pagina's die vergelijkbare onderwerpen bespreken. Dit betekent dat ik mijn verkenning kan richten op deze gebieden in plaats van willekeurig te browsen, wat veel efficiënter en relevanter zal zijn. Door me te concentreren op deze clusters, kan ik sneller de meest relevante informatie vinden.`
            };
        }

        // Target scope
        if (message.includes('Target scope')) {
            const count = message.match(/(\d+)\s+URLs/)?.[1] || 'meerdere';
            return {
                formattedMessage: message,
                thoughtBubble: `Op basis van de semantische analyse heb ik de verkenning teruggebracht tot ${count} URL's die waarschijnlijk relevante informatie bevatten. Deze gerichte aanpak betekent dat ik geen tijd verspil aan irrelevante pagina's - ik ben strategisch over waar ik moet zoeken. Door me te concentreren op deze specifieke URL's, kan ik dieper graven in de meest relevante bronnen.`
            };
        }

        // Probabilistic exploration
        if (message.includes('Probabilistic exploration')) {
            const randomness = message.match(/Randomness:\s*([\d.]+)/)?.[1] || message.match(/\(([\d.]+)\)/)?.[1];
            const randomnessDesc = randomness 
                ? parseFloat(randomness) < 0.3 
                    ? 'gefocust en deterministisch' 
                    : parseFloat(randomness) > 0.7 
                    ? 'verkennend en creatief' 
                    : 'gebalanceerd tussen focus en verkenning'
                : 'gebalanceerd';
            return {
                formattedMessage: message,
                thoughtBubble: randomness 
                    ? `Ik gebruik een probabilistische aanpak met ${randomness} willekeur (${randomnessDesc}). Dit betekent dat ik meestal de meest relevante paden zal volgen, maar af en toe ook minder voor de hand liggende verbindingen zal verkennen. Dit helpt me om onverwachte maar waardevolle inhoud te vinden die een puur deterministische zoekopdracht zou kunnen missen. De balans tussen focus en verkenning zorgt voor zowel efficiëntie als volledigheid.`
                    : `Ik gebruik een probabilistisch algoritme om interessante paden te verkennen. Dit betekent dat ik meestal de meest relevante paden zal volgen, maar af en toe ook minder voor de hand liggende verbindingen zal verkennen. Dit helpt me om onverwachte maar waardevolle inhoud te vinden die een puur deterministische zoekopdracht zou kunnen missen.`
            };
        }

        // External link exploration
        if (message.includes('external link')) {
            const maxLinks = message.match(/max:\s*(\d+)/)?.[1] || message.match(/(\d+)/)?.[1];
            return {
                formattedMessage: message,
                thoughtBubble: maxLinks 
                    ? `Ik verkenn nu externe links (tot ${maxLinks}). Dit is belangrijk omdat relevante informatie mogelijk op andere websites staat die verwijzen naar of worden genoemd door de huidige site. Ik volg deze verbindingen om een completer beeld van het onderwerp te krijgen. Externe links kunnen waardevolle context en aanvullende informatie bieden die niet direct op de hoofdsite beschikbaar is.`
                    : 'Ik verkenn nu externe links. Dit is belangrijk omdat relevante informatie mogelijk op andere websites staat die verwijzen naar of worden genoemd door de huidige site. Ik volg deze verbindingen om een completer beeld van het onderwerp te krijgen. Externe links kunnen waardevolle context en aanvullende informatie bieden.'
            };
        }

        // Completion messages
        if (message.includes('completed') || message.includes('complete')) {
            const count = message.match(/Added\s+(\d+)/)?.[1] || message.match(/(\d+)\s+nodes/)?.[1];
            return {
                formattedMessage: message,
                thoughtBubble: count 
                    ? `Succesvol voltooid! Ik heb ${count} nieuwe items toegevoegd aan de resultaten. Deze items zijn nu beschikbaar voor verdere analyse en kunnen worden gebruikt in volgende stappen van de workflow.`
                    : 'De operatie is succesvol voltooid! Alle geplande taken zijn uitgevoerd en de resultaten zijn beschikbaar voor verdere verwerking.'
            };
        }

        // Expansion messages
        if (message.includes('Expanding')) {
            const nodeInfo = message.match(/from subgraph node:\s*(.+)/)?.[1] || message.match(/from:\s*(.+)/)?.[1] || 'nodes';
            return {
                formattedMessage: message,
                thoughtBubble: `Ik breid de grafiek uit door verbindingen te verkennen vanaf ${nodeInfo}. Dit betekent dat ik nieuwe pagina's en relaties ontdek door de links te volgen die ik op deze locaties vind. Hoe meer ik verkenn, hoe completer mijn beeld wordt van de structuur en inhoud van de website.`
            };
        }

        // Merge messages
        if (message.includes('Merging')) {
            const stats = message.match(/(\d+)\s+nodes/)?.[1];
            return {
                formattedMessage: message,
                thoughtBubble: stats 
                    ? `Ik consolideer de resultaten in de hoofdfgrafiek met ${stats} nodes. Dit betekent dat ik alle nieuwe informatie die ik heb gevonden samenvoeg met de bestaande kennis, zodat ik een compleet en geïntegreerd beeld krijg van alle beschikbare informatie.`
                    : 'Ik consolideer de resultaten in de hoofdnavigatiegrafiek. Dit betekent dat ik alle nieuwe informatie die ik heb gevonden samenvoeg met de bestaande kennis, zodat ik een compleet en geïntegreerd beeld krijg van alle beschikbare informatie.'
            };
        }

        // Graph operations
        if (message.includes('Navigation graph') || message.includes('graph')) {
            if (message.includes('saved') || message.includes('saved to disk')) {
                return {
                    formattedMessage: message,
                    thoughtBubble: 'Ik sla de huidige staat van de navigatiegrafiek op naar schijf. Deze grafiek vertegenwoordigt alle verbindingen tussen pagina\'s die ik heb ontdekt, dus door deze op te slaan kunnen toekomstige zoekopdrachten voortbouwen op deze kennis en sneller zijn. Dit betekent dat ik bij elke nieuwe zoekopdracht niet helemaal opnieuw hoef te beginnen, maar kan voortbouwen op wat ik al weet.'
                };
            }
            if (message.includes('initialized')) {
                const nodeCount = message.match(/(\d+)\s+existing nodes/)?.[1] || message.match(/(\d+)/)?.[1];
                return {
                    formattedMessage: message,
                    thoughtBubble: nodeCount 
                        ? `Ik laad de navigatiegrafiek die ik heb opgebouwd uit eerdere zoekopdrachten. Deze bevat ${nodeCount} nodes (pagina's) die ik eerder heb gezien, samen met hun verbindingen. Dit geeft me een voorsprong - ik kan deze bestaande kennis gebruiken om relevante pagina's sneller te vinden in plaats van helemaal opnieuw te beginnen.`
                        : 'Ik initialiseer de navigatiegrafiekstructuur. Deze grafiek helpt me om verbindingen tussen pagina\'s bij te houden en slimmere beslissingen te nemen over waar ik vervolgens moet verkennen. Het is als een kaart die ik opbouw terwijl ik de website verkenn.'
                };
            }
            if (message.includes('updated') || message.includes('added')) {
                return {
                    formattedMessage: message,
                    thoughtBubble: 'Ik werk de navigatiegrafiek bij met nieuwe pagina\'s en verbindingen die ik heb ontdekt. Elke nieuwe verbinding helpt me de structuur van de website beter te begrijpen, wat toekomstige zoekopdrachten efficiënter maakt. Hoe meer ik leer over de structuur, hoe slimmer ik kan navigeren.'
                };
            }
        }

        // Exploration messages
        if (message.includes('Exploring:') || message.includes('Exploring ') || message.includes('BFS:')) {
            const url = message.match(/https?:\/\/[^\s]+/)?.[0] || message.match(/BFS:\s*(.+)/)?.[1] || 'URL';
            const domain = url.match(/https?:\/\/([^/]+)/)?.[1] || 'deze pagina';
            return {
                formattedMessage: message,
                thoughtBubble: `Ik verkenn nu ${domain}. Ik lees de pagina-inhoud, extraheer eventuele links naar andere pagina's en zoek naar documenten of relevante informatie. Dit is een breadth-first search (BFS) aanpak - ik verkenn pagina's op het huidige niveau voordat ik dieper ga, wat me helpt om eerst een breed overzicht te krijgen voordat ik me concentreer op specifieke details.`
            };
        }

        // Subgraph messages
        if (message.includes('subgraph')) {
            const nodeCount = message.match(/(\d+)\s+nodes/)?.[1] || message.match(/Created subgraph with\s+(\d+)/)?.[1];
            const isCreating = message.includes('Creating') || message.includes('Created');
            return {
                formattedMessage: message,
                thoughtBubble: isCreating
                    ? nodeCount 
                        ? `Ik maak een gefocust subgrafiek met ${nodeCount} nodes die het meest relevant zijn voor de zoekopdracht. In plaats van de volledige navigatiegrafiek te tonen (die enorm kan zijn), filter ik deze terug tot alleen de delen die belangrijk zijn voor deze zoekopdracht. Dit maakt het gemakkelijker te begrijpen en te navigeren, en helpt u om snel de relevante informatie te vinden.`
                        : 'Ik maak een gefocust subgrafiek van de bestaande navigatiegrafiek. In plaats van alles te tonen, filter ik deze terug tot alleen de delen die relevant zijn voor deze zoekopdracht, wat het gemakkelijker maakt om te begrijpen en te navigeren.'
                    : nodeCount 
                        ? `Ik toon een relevant subgrafiek met ${nodeCount} nodes uit de bestaande navigatiegrafiek. Dit toont u de verbindingen tussen pagina's die relevant zijn voor uw zoekopdracht, en helpt u te begrijpen hoe de informatie is gestructureerd en hoe verschillende pagina's met elkaar verbonden zijn.`
                        : 'Ik toon een relevant subgrafiek uit de bestaande navigatiegrafiek. Dit toont u de verbindingen tussen pagina\'s die relevant zijn voor uw zoekopdracht, en helpt u te begrijpen hoe de informatie is gestructureerd.'
            };
        }

        // Starting expansion
        if (message.includes('Starting expansion')) {
            return {
                formattedMessage: message,
                thoughtBubble: 'Ik begin nu de grafiek uit te breiden vanaf de relevante startpunten die ik heb gevonden. Dit betekent dat ik links zal volgen vanaf die pagina\'s om meer gerelateerde inhoud te ontdekken. Ik ben strategisch - ik begin vanaf pagina\'s die al relevant zijn, dus de pagina\'s die ik daarvan ontdek zijn waarschijnlijk ook relevant. Deze aanpak zorgt voor een efficiënte en gerichte verkenning.'
            };
        }

        // Finding nodes
        if (message.includes('Finding relevant nodes') || message.includes('Finding relevant')) {
            const query = message.match(/query:\s*(.+)/)?.[1] || message.match(/for:\s*(.+)/)?.[1];
            return {
                formattedMessage: message,
                thoughtBubble: query 
                    ? `Ik doorzoek de bestaande navigatiegrafiek om pagina's te vinden die gerelateerd zijn aan "${query}". De grafiek bevat verbindingen tussen pagina's die ik eerder heb gezien, dus ik kan deze kennis gebruiken om snel relevante startpunten te vinden in plaats van helemaal opnieuw te beginnen. Dit maakt de zoekopdracht veel efficiënter.`
                    : 'Ik doorzoek de bestaande navigatiegrafiek om relevante nodes te vinden. De grafiek bevat verbindingen tussen pagina\'s die ik eerder heb gezien, dus ik kan deze kennis gebruiken om snel relevante startpunten te vinden in plaats van helemaal opnieuw te beginnen.'
            };
        }

        // Found nodes/documents/clusters
        if (message.includes('Found') && (message.includes('nodes') || message.includes('documents') || message.includes('items') || message.includes('clusters'))) {
            const count = message.match(/Found\s+(\d+)/)?.[1] || message.match(/(\d+)\s+(nodes|documents|items|clusters)/)?.[1];
            const type = message.match(/(nodes|documents|items|clusters)/)?.[1] || 'items';
            const typeDesc = type === 'nodes' ? 'pagina\'s of secties' : type === 'documents' ? 'documenten' : type === 'clusters' ? 'inhoudsclusters' : 'items';
            
            // Extract cluster labels if present
            const clusterLabelsMatch = message.match(/clusters:\s*(.+?)(?:\s*$)/)?.[1];
            const clusterInfo = clusterLabelsMatch ? ` (${clusterLabelsMatch})` : '';
            
            return {
                formattedMessage: message,
                thoughtBubble: count 
                    ? `Uitstekend! Ik heb ${count} relevante ${typeDesc}${clusterInfo} gevonden die overeenkomen met de zoekcriteria. Deze zien er veelbelovend uit - ik zal nu elk item onderzoeken om de daadwerkelijke inhoud te extraheren en te bepalen hoe relevant ze zijn voor uw zoekopdracht. Ik zal de inhoud analyseren op relevantie, kwaliteit en volledigheid.`
                    : `Ik heb verschillende relevante ${typeDesc}${clusterInfo} gevonden die overeenkomen met de zoekcriteria. Deze zien er veelbelovend uit - ik zal nu elk item onderzoeken om de daadwerkelijke inhoud te extraheren en te bepalen hoe relevant ze zijn voor uw zoekopdracht.`
            };
        }

        // Scanning messages
        if (message.includes('Scanning') || message.includes('scanning')) {
            const target = message.match(/for:\s*(.+?)(?:\s*\(|$)/)?.[1] || message.match(/Scanning\s+(.+)/)?.[1] || 'inhoud';
            const isIPLO = message.includes('IPLO');
            return {
                formattedMessage: message,
                thoughtBubble: isIPLO
                    ? `Ik scan IPLO (de Nederlandse beleidsdocumentendatabase) voor "${target}". IPLO is een uitgebreide bron van overheidsbeleidsdocumenten, dus dit is een strategische plek om te zoeken. Ik doorzoek hun geïndexeerde documenten om officieel beleid te vinden dat overeenkomt met de zoekopdracht. IPLO bevat vaak de meest actuele en officiële beleidsinformatie.`
                    : `Ik scan systematisch voor "${target}". Dit houdt in dat ik bronnen systematisch controleer om inhoud te vinden die overeenkomt met de zoekcriteria. Ik zal elk resultaat evalueren om te zien of het relevant is voordat ik het opneem in de resultaten.`
            };
        }

        // Workflow terminal step completion
        if (message.includes('Workflow reached terminal step')) {
            const stepMatch = message.match(/terminal step:\s*(.+?)\s*\(/);
            const stepName = stepMatch?.[1] || 'deze stap';
            return {
                formattedMessage: message,
                thoughtBubble: `De workflow is succesvol voltooid bij "${stepName}". Dit is de laatste stap van de workflow - er zijn geen verdere stappen meer. Alle resultaten zijn nu beschikbaar en klaar voor gebruik. De workflow heeft alle geplande taken uitgevoerd.`
            };
        }

        // Warning messages
        if (level === 'warn') {
            const noRelevantMatch = message.match(/No relevant (.+)/);
            if (noRelevantMatch) {
                const item = noRelevantMatch[1];
                return {
                    formattedMessage: message,
                    thoughtBubble: `Ik kon geen relevante ${item} vinden voor deze zoekopdracht. Dit kan betekenen dat de zoekcriteria te specifiek zijn, of dat deze specifieke bron geen informatie heeft over dit onderwerp. Ik zal doorgaan met de workflow, maar deze stap zal geen resultaten opleveren. Mogelijk zijn er andere bronnen die wel relevante informatie bevatten.`
                };
            }
            
            // Specific handler for fresh start with paused run
            if (message.includes('Starting new workflow but run was paused')) {
                return {
                    formattedMessage: message,
                    thoughtBubble: 'Ik heb een gepauzeerde workflow gevonden, maar je hebt op "Start" geklikt in plaats van "Hervatten". Ik reset de workflow en start helemaal opnieuw vanaf het begin. Als je de gepauzeerde workflow wilt voortzetten, gebruik dan de knop "Hervatten".'
                };
            }
            
            // Specific handler for resume with missing pausedState
            if (message.includes('Resuming paused workflow but pausedState is missing')) {
                return {
                    formattedMessage: message,
                    thoughtBubble: 'Ik probeer de workflow te hervatten, maar de opgeslagen staat is niet beschikbaar. Ik probeer de workflow te herstellen met de beschikbare informatie, maar sommige context kan verloren zijn gegaan. De workflow zal doorgaan waar mogelijk.'
                };
            }
            
            // Specific handler for fresh start (should not show warning)
            if (message.includes('Starting fresh workflow execution from first step')) {
                return {
                    formattedMessage: message,
                    thoughtBubble: 'Ik start een nieuwe workflow vanaf het begin. Alle stappen worden opnieuw uitgevoerd met de huidige parameters.'
                };
            }
            
            // Handler for resume warning (only appears when actually resuming without state)
            if (message.includes('Resuming workflow but no checkpoint or stepId found')) {
                return {
                    formattedMessage: message,
                    thoughtBubble: 'Ik probeer een workflow te hervatten, maar ik kan de opgeslagen staat niet vinden. Ik start vanaf het begin, maar dit kan betekenen dat eerdere resultaten verloren zijn gegaan. Als je een specifieke workflow wilt hervatten, gebruik dan de "Hervatten" knop in plaats van "Start".'
                };
            }
            
            // Handler for "No documents to rank" warning (RankResultsModule)
            if (message.includes('No documents to rank')) {
                return {
                    formattedMessage: message,
                    thoughtBubble: 'Er zijn geen documenten beschikbaar om te rangschikken. Dit kan gebeuren als eerdere stappen in de workflow geen documenten hebben gevonden, of als alle documenten al zijn gefilterd. De workflow gaat door, maar de rangschikstap wordt overgeslagen. Dit is normaal gedrag en betekent niet dat er iets mis is gegaan.'
                };
            }
            
            // Handler for "No query provided" warning (RankResultsModule)
            if (message.includes('No query provided for ranking')) {
                return {
                    formattedMessage: message,
                    thoughtBubble: 'Er is geen zoekopdracht (query) opgegeven voor het rangschikken van documenten. Zonder een query kan ik geen semantische rangschikking uitvoeren, dus ik retourneer de documenten in hun oorspronkelijke volgorde. De documenten zijn nog steeds beschikbaar en bruikbaar, alleen niet gerangschikt op relevantie.'
                };
            }
            
            // Handler for "Re-ranker failed" warning (RankResultsModule)
            if (message.includes('Re-ranker failed') || message.includes('falling back to simple ranking')) {
                const errorMatch = message.match(/Re-ranker failed\s*\(([^)]+)\)/);
                const errorDetail = errorMatch?.[1] || 'service niet beschikbaar';
                return {
                    formattedMessage: message,
                    thoughtBubble: `De semantische herrangschikker (re-ranker) is niet beschikbaar (${errorDetail}). Dit kan gebeuren als de re-ranker service niet actief is of tijdelijk niet bereikbaar. Ik gebruik nu een eenvoudige rangschikking op basis van de beschikbare documenteigenschappen. De resultaten zijn nog steeds geldig en bruikbaar, alleen zonder de geavanceerde semantische optimalisatie.`
                };
            }
            
            return {
                formattedMessage: message,
                thoughtBubble: 'Dit is een waarschuwing - er is iets onverwachts gebeurd, maar ik kan doorgaan. De operatie kan beperkingen hebben of mogelijk niet alles vinden, maar ik zal mijn best doen met wat ik heb. Dit betekent niet dat de workflow is mislukt, maar dat sommige resultaten mogelijk beperkt zijn.'
            };
        }

        // Error messages
        if (level === 'error') {
            return {
                formattedMessage: message,
                thoughtBubble: `Er is een fout opgetreden: ${message}. Dit kan verschillende oorzaken hebben, zoals netwerkproblemen, ongeldige configuratie, of problemen met de toegang tot bepaalde bronnen. Ik zal proberen door te gaan waar mogelijk, maar deze fout kan de resultaten beïnvloeden.`
            };
        }

        // Default formatting - return message as-is without emojis
        return { formattedMessage: message };
    }

    /**
     * Get color and icon for log level
     */
    private getLevelStyle(level: string): { color: string; icon: string } {
        switch (level) {
            case 'error':
                return {
                    color: 'text-red-400',
                    icon: ''
                };
            case 'warn':
                return {
                    color: 'text-yellow-400',
                    icon: ''
                };
            case 'debug':
                return {
                    color: 'text-gray-400',
                    icon: ''
                };
            default:
                return {
                    color: 'text-blue-400',
                    icon: ''
                };
        }
    }

    /**
     * Truncate long URLs for display
     */
    private truncateUrl(url: string, maxLength: number = 60): string {
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength - 3) + '...';
    }
}

