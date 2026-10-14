/**
 * Curated botanical imagery and nursery branding assets.
 * Ensures the marketplace has vivid, photorealistic visuals for all plant species,
 * nurseries, and categories, avoiding empty emoji placeholders.
 */

export interface NurseryBranding {
  name: string;
  slug: string;
  tagline: string;
  badge: string;
  coverImage: string;
  avatarImage: string;
  founded: string;
  specialty: string;
  soilMix: string;
  highlights: string[];
}

const PLANT_PHOTOS: Record<string, string> = {
  // Indoor foliage
  'snake-plant': 'https://images.unsplash.com/photo-1593482892290-f54927ae1bf6?auto=format&fit=crop&w=800&q=80',
  'monstera': 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?auto=format&fit=crop&w=800&q=80',
  'monstera-deliciosa': 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?auto=format&fit=crop&w=800&q=80',
  'money-plant': 'https://images.unsplash.com/photo-1545241047-6083a3684587?auto=format&fit=crop&w=800&q=80',
  'peace-lily': 'https://images.unsplash.com/photo-1593691509543-c55fb32e7355?auto=format&fit=crop&w=800&q=80',
  'areca-palm': 'https://images.unsplash.com/photo-1600411833196-7c1f6b1a8b90?auto=format&fit=crop&w=800&q=80',
  'zz-plant': 'https://images.unsplash.com/photo-1632207691143-643e2a9a9361?auto=format&fit=crop&w=800&q=80',
  'jade-plant': 'https://images.unsplash.com/photo-1509423350716-97f9360b4e09?auto=format&fit=crop&w=800&q=80',
  'spider-plant': 'https://images.unsplash.com/photo-1572688484437-1d5d28b9318b?auto=format&fit=crop&w=800&q=80',
  'aloe-vera': 'https://images.unsplash.com/photo-1567689265664-1c48de61db0b?auto=format&fit=crop&w=800&q=80',
  'rubber-plant': 'https://images.unsplash.com/photo-1508022713622-df2d8fb7b4ea?auto=format&fit=crop&w=800&q=80',
  'calathea': 'https://images.unsplash.com/photo-1592150621744-aca64f48394a?auto=format&fit=crop&w=800&q=80',
  'boston-fern': 'https://images.unsplash.com/photo-1596724803975-4c0702d73b06?auto=format&fit=crop&w=800&q=80',
  'fiddle-leaf-fig': 'https://images.unsplash.com/photo-1598880940080-ff9a29891b85?auto=format&fit=crop&w=800&q=80',
  'aglaonema': 'https://images.unsplash.com/photo-1602928321679-560bb453f190?auto=format&fit=crop&w=800&q=80',
  'syngonium': 'https://images.unsplash.com/photo-1617173944883-6ffbd35d584d?auto=format&fit=crop&w=800&q=80',
  'anthurium': 'https://images.unsplash.com/photo-1584589167171-541ce45f1eea?auto=format&fit=crop&w=800&q=80',

  // Flowering
  'hibiscus': 'https://images.unsplash.com/photo-1550950158-d0d960dff51b?auto=format&fit=crop&w=800&q=80',
  'jasmine': 'https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?auto=format&fit=crop&w=800&q=80',
  'bougainvillea': 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80',
  'marigold': 'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?auto=format&fit=crop&w=800&q=80',

  // Succulents & general
  'succulent': 'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?auto=format&fit=crop&w=800&q=80',
  'cactus': 'https://images.unsplash.com/photo-1509587584298-0f3b3a3a1797?auto=format&fit=crop&w=800&q=80',
  'bonsai': 'https://images.unsplash.com/photo-1512428813834-c702c7702b78?auto=format&fit=crop&w=800&q=80',
  'default': 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=800&q=80',
};

const NURSERY_BRANDING_MAP: Record<string, NurseryBranding> = {
  'lalbagh-green-nursery': {
    name: 'Lalbagh Green Nursery',
    slug: 'lalbagh-green-nursery',
    tagline: 'Three Generations of Botanical Heritage in Bengaluru',
    badge: '👑 Heritage Nursery',
    coverImage: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=1600&q=80',
    avatarImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    founded: 'Est. 1974',
    specialty: 'Ornamental Flowering Bushes & South Indian Garden Flora',
    soilMix: 'Red clay loam enriched with neem cake & aged vermicompost',
    highlights: ['Lalbagh Botanical Seedlings', 'Direct Grower Pricing', 'Same-day South Bengaluru Courier'],
  },
  'indiranagar-urban-jungle': {
    name: 'Indiranagar Urban Jungle',
    slug: 'indiranagar-urban-jungle',
    tagline: 'Curated Boutique Foliage & Handcrafted Ceramic Planters',
    badge: '🪴 Urban Design Studio',
    coverImage: 'https://images.unsplash.com/photo-1463936575829-25148e1db1b8?auto=format&fit=crop&w=1600&q=80',
    avatarImage: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&q=80',
    founded: 'Est. 2018',
    specialty: 'Rare Aroids, Monstera & Low-Light Apartment Plants',
    soilMix: 'Aroid chunky blend (orchid bark, perlite, pumice & biochar)',
    highlights: ['Apartment-Friendly Potting', 'Pest-Free Guarantee', 'Design Consultation Included'],
  },
  'whitefield-plant-studio': {
    name: 'Whitefield Plant Studio',
    slug: 'whitefield-plant-studio',
    tagline: 'Architectural Specimen Trees & Biophilic Office Landscapes',
    badge: '🌴 Specimen Tree Expert',
    coverImage: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1600&q=80',
    avatarImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    founded: 'Est. 2015',
    specialty: 'Large Fiddle Leaf Figs, Bird of Paradise & Corporate Greens',
    soilMix: 'Slow-draining horticultural peat with granular root inoculants',
    highlights: ['Tech Park Express Route', 'Self-Watering Planters', 'Plant Doctor Support'],
  },
  'jayanagar-flower-bazaar': {
    name: 'Jayanagar Flower Bazaar',
    slug: 'jayanagar-flower-bazaar',
    tagline: 'Seasonal Blooming Beauties & Sacred South Indian Flora',
    badge: '🌸 Fragrant Flora Haven',
    coverImage: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&w=1600&q=80',
    avatarImage: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
    founded: 'Est. 1989',
    specialty: 'Fragrant Jasmine, Ramanagara Marigold & Hibiscus',
    soilMix: 'Natural river silt mixed with composted cow manure',
    highlights: ['Pooja & Garden Fresh', 'Daily Harvest Buds', 'Pollinator-Friendly Varieties'],
  },
  'hebbal-succulent-co': {
    name: 'Hebbal Succulent Co.',
    slug: 'hebbal-succulent-co',
    tagline: 'Specialty Cacti, Rare Lithops & Artisanal Terrariums',
    badge: '🌵 Desert Flora Artisan',
    coverImage: 'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?auto=format&fit=crop&w=1600&q=80',
    avatarImage: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
    founded: 'Est. 2021',
    specialty: 'Miniature Succulent Gardens & Drought-Tolerant Specimens',
    soilMix: 'Mineral-rich gritty mix (80% lava rock, pumice & coarse sand)',
    highlights: ['Handmade Glass Terrariums', 'Zero-Neglect Plants', 'North Bengaluru Pickup'],
  },
};

/**
 * Returns a high-res botanical photo for a plant by checking its custom image,
 * slug, common name or botanical scientific name.
 */
export function getPlantImage(slugOrTitle?: string | null, customUrl?: string | null): string {
  if (customUrl && customUrl.startsWith('http')) {
    return customUrl;
  }
  if (!slugOrTitle) {
    return PLANT_PHOTOS['default'];
  }

  const normalized = slugOrTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');

  // Exact match
  if (PLANT_PHOTOS[normalized]) {
    return PLANT_PHOTOS[normalized];
  }

  // Substring match
  for (const [key, url] of Object.entries(PLANT_PHOTOS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return url;
    }
  }

  // Keyword heuristics
  if (normalized.includes('snake') || normalized.includes('dracaena')) return PLANT_PHOTOS['snake-plant'];
  if (normalized.includes('money') || normalized.includes('pothos') || normalized.includes('epipremnum')) return PLANT_PHOTOS['money-plant'];
  if (normalized.includes('peace') || normalized.includes('lily') || normalized.includes('spathiphyllum')) return PLANT_PHOTOS['peace-lily'];
  if (normalized.includes('monstera') || normalized.includes('philodendron')) return PLANT_PHOTOS['monstera'];
  if (normalized.includes('palm') || normalized.includes('areca') || normalized.includes('chamaedorea')) return PLANT_PHOTOS['areca-palm'];
  if (normalized.includes('zz') || normalized.includes('zamioculcas')) return PLANT_PHOTOS['zz-plant'];
  if (normalized.includes('jade') || normalized.includes('crassula')) return PLANT_PHOTOS['jade-plant'];
  if (normalized.includes('spider') || normalized.includes('chlorophytum')) return PLANT_PHOTOS['spider-plant'];
  if (normalized.includes('aloe')) return PLANT_PHOTOS['aloe-vera'];
  if (normalized.includes('rubber') || normalized.includes('ficus-elastica')) return PLANT_PHOTOS['rubber-plant'];
  if (normalized.includes('calathea') || normalized.includes('maranta')) return PLANT_PHOTOS['calathea'];
  if (normalized.includes('fern') || normalized.includes('nephrolepis')) return PLANT_PHOTOS['boston-fern'];
  if (normalized.includes('fig') || normalized.includes('lyrata')) return PLANT_PHOTOS['fiddle-leaf-fig'];
  if (normalized.includes('hibiscus')) return PLANT_PHOTOS['hibiscus'];
  if (normalized.includes('jasmine') || normalized.includes('mogra')) return PLANT_PHOTOS['jasmine'];
  if (normalized.includes('bougainvillea')) return PLANT_PHOTOS['bougainvillea'];
  if (normalized.includes('marigold')) return PLANT_PHOTOS['marigold'];
  if (normalized.includes('succulent') || normalized.includes('cactus') || normalized.includes('cacti')) return PLANT_PHOTOS['succulent'];

  return PLANT_PHOTOS['default'];
}

/**
 * Returns branding & story data for a nursery by slug.
 */
export function getNurseryBranding(slug?: string | null): NurseryBranding {
  if (slug && NURSERY_BRANDING_MAP[slug]) {
    return NURSERY_BRANDING_MAP[slug];
  }

  // Fallback default branding
  return {
    name: 'Verified Local Nursery',
    slug: slug || 'local-nursery',
    tagline: 'Fresh Potted Greenery Direct From Bengaluru Growers',
    badge: '🌿 Verified Nursery',
    coverImage: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=1600&q=80',
    avatarImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    founded: 'Local Grower',
    specialty: 'Healthy Potted Plants & Fresh Foliage',
    soilMix: 'Balanced potting mix with organic compost',
    highlights: ['Locally Acclimated Plants', 'Eco-friendly Root Care', 'Same-Day Fast Courier'],
  };
}
