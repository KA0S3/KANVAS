import type { ExtendedAsset, CustomField, GeneratorData } from '@/types/extendedAsset';

export interface GeneratorMapping {
  [key: string]: {
    field: string;
    type: 'string' | 'number' | 'boolean' | 'array';
    showOnCanvas?: boolean;
  };
}

export const GENERATOR_MAPPINGS: Record<string, GeneratorMapping> = {
  character: {
    name: { field: 'name', type: 'string' },
    description: { field: 'description', type: 'string' },
    age: { field: 'age', type: 'number', showOnCanvas: true },
    class: { field: 'class', type: 'string', showOnCanvas: true },
    race: { field: 'race', type: 'string', showOnCanvas: true },
    background: { field: 'background', type: 'string' },
    abilities: { field: 'abilities', type: 'array' },
    equipment: { field: 'equipment', type: 'array' },
    personality: { field: 'personality', type: 'string' },
    appearance: { field: 'appearance', type: 'string' },
  },
  city: {
    name: { field: 'name', type: 'string' },
    description: { field: 'description', type: 'string' },
    population: { field: 'population', type: 'number', showOnCanvas: true },
    government: { field: 'government', type: 'string', showOnCanvas: true },
    economy: { field: 'economy', type: 'string' },
    landmarks: { field: 'landmarks', type: 'array' },
    districts: { field: 'districts', type: 'array' },
    history: { field: 'history', type: 'string' },
    culture: { field: 'culture', type: 'string' },
  },
  item: {
    name: { field: 'name', type: 'string' },
    description: { field: 'description', type: 'string' },
    type: { field: 'type', type: 'string', showOnCanvas: true },
    rarity: { field: 'rarity', type: 'string', showOnCanvas: true },
    properties: { field: 'properties', type: 'array' },
    value: { field: 'value', type: 'number' },
    weight: { field: 'weight', type: 'number' },
    requirements: { field: 'requirements', type: 'array' },
  },
  location: {
    name: { field: 'name', type: 'string' },
    description: { field: 'description', type: 'string' },
    type: { field: 'type', type: 'string', showOnCanvas: true },
    size: { field: 'size', type: 'string' },
    climate: { field: 'climate', type: 'string' },
    inhabitants: { field: 'inhabitants', type: 'array' },
    resources: { field: 'resources', type: 'array' },
    dangers: { field: 'dangers', type: 'array' },
  },
};

export const DEFAULT_TAGS: Record<string, string[]> = {
  character: ['NPC', 'Character'],
  city: ['Location', 'Settlement'],
  item: ['Item', 'Equipment'],
  location: ['Location', 'Place'],
};

export class GeneratorParser {
  static parseGeneratorData(generatorData: GeneratorData): Omit<ExtendedAsset, 'id' | 'x' | 'y' | 'parentId' | 'children'> {
    const { type, data } = generatorData;
    const mapping = GENERATOR_MAPPINGS[type];
    const defaultTags = DEFAULT_TAGS[type] || [];

    if (!mapping) {
      throw new Error(`Unsupported generator type: ${type}`);
    }

    const asset: Partial<ExtendedAsset> = {
      type: 'other', // Default type for generated assets
      customFields: [],
      tags: defaultTags,
    };

    // Map standard fields
    if (data.name) asset.name = String(data.name);
    if (data.description) asset.description = String(data.description);

    // Create custom fields from mapped data
    const customFields: CustomField[] = [];

    Object.entries(mapping).forEach(([key, config]) => {
      const value = data[config.field];
      
      if (value !== undefined && value !== null) {
        let processedValue: string;

        switch (config.type) {
          case 'array':
            processedValue = Array.isArray(value) ? value.join(', ') : String(value);
            break;
          case 'boolean':
            processedValue = value ? 'Yes' : 'No';
            break;
          case 'number':
            processedValue = String(value);
            break;
          default:
            processedValue = String(value);
        }

        customFields.push({
          id: crypto.randomUUID(),
          name: key,
          value: processedValue,
          showOnCanvas: config.showOnCanvas || false,
        });
      }
    });

    // Add any additional fields not in mapping as custom fields
    Object.entries(data).forEach(([key, value]) => {
      const isMapped = Object.values(mapping).some(config => config.field === key);
      const isStandardField = ['name', 'description'].includes(key);

      if (!isMapped && !isStandardField && value !== undefined && value !== null) {
        let processedValue: string;

        if (Array.isArray(value)) {
          processedValue = value.join(', ');
        } else if (typeof value === 'object') {
          processedValue = JSON.stringify(value);
        } else {
          processedValue = String(value);
        }

        customFields.push({
          id: crypto.randomUUID(),
          name: key,
          value: processedValue,
          showOnCanvas: false,
        });
      }
    });

    asset.customFields = customFields;

    return asset as Omit<ExtendedAsset, 'id' | 'x' | 'y' | 'parentId' | 'children'>;
  }

  static validateGeneratorData(generatorData: any): generatorData is GeneratorData {
    return (
      generatorData &&
      typeof generatorData === 'object' &&
      typeof generatorData.type === 'string' &&
      ['character', 'city', 'item', 'location'].includes(generatorData.type) &&
      generatorData.data &&
      typeof generatorData.data === 'object'
    );
  }

  static getSupportedTypes(): string[] {
    return Object.keys(GENERATOR_MAPPINGS);
  }

  static getMappingForType(type: string): GeneratorMapping | null {
    return GENERATOR_MAPPINGS[type] || null;
  }
}

// Example generator data for testing
export const EXAMPLE_GENERATOR_DATA = {
  character: {
    type: 'character',
    data: {
      name: 'Aldric Stormwind',
      description: 'A brave warrior from the northern mountains',
      age: 35,
      class: 'Fighter',
      race: 'Human',
      background: 'Former soldier turned adventurer',
      abilities: ['Sword Mastery', 'Shield Wall', 'Battle Cry'],
      equipment: ['Longsword', 'Shield', 'Chain Mail'],
      personality: 'Brave, loyal, and protective',
      appearance: 'Tall with broad shoulders and weathered face',
    },
  },
  city: {
    type: 'city',
    data: {
      name: 'Silverhaven',
      description: 'A bustling port city on the western coast',
      population: 50000,
      government: 'Merchant Council',
      economy: 'Trade and fishing',
      landmarks: ['Grand Harbor', 'Merchant Quarter', 'Temple of the Sea'],
      districts: ['Harbor District', 'Market District', 'Noble Quarter'],
      history: 'Founded 200 years ago as a trading post',
      culture: 'Maritime traditions and merchant values',
    },
  },
};
