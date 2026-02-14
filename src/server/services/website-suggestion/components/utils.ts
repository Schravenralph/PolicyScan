export function getGovernmentDomains(websiteTypes: string[]): string[] {
    const domains: string[] = [];

    if (websiteTypes.includes('gemeente')) {
      domains.push('amsterdam.nl', 'rotterdam.nl', 'denhaag.nl', 'utrecht.nl', 'eindhoven.nl', 'groningen.nl');
    }
    if (websiteTypes.includes('provincie')) {
      domains.push('noord-holland.nl', 'zuid-holland.nl', 'utrecht.nl', 'noord-brabant.nl', 'gelderland.nl');
    }
    if (websiteTypes.includes('rijk')) {
      domains.push('rijksoverheid.nl', 'overheid.nl', 'officielebekendmakingen.nl');
    }
    if (websiteTypes.includes('waterschap')) {
      domains.push('waterschap.nl', 'hoogheemraadschap.nl');
    }

    return domains;
}
