/**
 * Utility function to map municipality names to court identifiers for Rechtspraak.nl filtering
 * 
 * This mapping is used to filter jurisprudence search results by court jurisdiction
 * when a municipality name is provided via the `overheidsinstantie` parameter.
 * 
 * Court identifiers follow the ECLI format: [TYPE][LOCATION]
 * - RB = Rechtbank (District Court)
 * - GH = Gerechtshof (Court of Appeal)
 * - HR = Hoge Raad (Supreme Court)
 */

/**
 * Maps a municipality name to a court identifier for filtering Rechtspraak.nl search results
 * 
 * @param municipalityName The municipality name (e.g., "Amsterdam", "Den Haag")
 * @returns The court identifier (e.g., "RBAMS", "RBDHA") or undefined if no mapping exists
 */
export function mapMunicipalityToCourt(municipalityName: string | undefined): string | undefined {
  if (!municipalityName) {
    return undefined;
  }

  // Normalize input: trim, lowercase, remove extra spaces
  const normalized = municipalityName.trim().toLowerCase().replace(/\s+/g, ' ');

  // Mapping of municipality names to court identifiers
  // Note: This is a simplified mapping. In practice, multiple municipalities
  // may fall under the same court jurisdiction.
  const municipalityToCourtMap: Record<string, string> = {
    // Major cities - Rechtbanken (District Courts)
    'amsterdam': 'RBAMS',
    'den haag': 'RBDHA',
    "'s-gravenhage": 'RBDHA',
    's-gravenhage': 'RBDHA',
    'gravenhage': 'RBDHA',
    'rotterdam': 'RBROT',
    'utrecht': 'RBUTR',
    'groningen': 'RBGRO',
    'eindhoven': 'RBEIN',
    'maastricht': 'RBMAA',
    'arnhem': 'RBARN',
    'leeuwarden': 'RBLEE',
    'middelburg': 'RBMID',
    "den bosch": 'RBDB',
    "'s-hertogenbosch": 'RBDB',
    's-hertogenbosch': 'RBDB',
    'hertogenbosch': 'RBDB',
    'tilburg': 'RBTIL',
    'breda': 'RBBRE',
    'nijmegen': 'RBNIJ',
    'enschede': 'RBENS',
    'almere': 'RBALM',
    'haarlem': 'RBHAA',
    'zwolle': 'RBZWO',
    'apeldoorn': 'RBAPE',
    'amersfoort': 'RBAME',
    'dordrecht': 'RBDOR',
    'leiden': 'RBLEI',
    'delft': 'RBDEL',
    'schiedam': 'RBSCI',
    'hoofddorp': 'RBHOO',
    'zaandam': 'RBZAA',
    'haarlemmermeer': 'RBHAA', // Falls under Haarlem jurisdiction
  };

  // Direct lookup
  if (municipalityToCourtMap[normalized]) {
    return municipalityToCourtMap[normalized];
  }

  // Try partial matching for variations (e.g., "Gemeente Amsterdam" -> "amsterdam")
  for (const [key, court] of Object.entries(municipalityToCourtMap)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return court;
    }
  }

  // No mapping found
  return undefined;
}


