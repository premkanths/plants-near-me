import Link from 'next/link';
import { HealthCard } from '@/components/HealthCard';
import { RecommendationGrid } from '@/components/recommendations/RecommendationGrid';
import { PlantQuizWidget } from '@/components/PlantQuizWidget';
import { fetchHealth } from '@/lib/api';
import type { RecommendationResponse } from '@/lib/recommendation-types';
import { serverApiSafe } from '@/lib/server-api';

export const revalidate = 60;

const POPULAR_FALLBACK_PICKS: RecommendationResponse = {
  strategy: 'popular',
  personalised: false,
  basedOn: 0,
  llm: false,
  items: [
    {
      productId: 'monstera-deliciosa-curated',
      title: 'Monstera Deliciosa (Swiss Cheese Plant)',
      price: '580',
      stock: 25,
      imageUrl: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?auto=format&fit=crop&w=600&q=80',
      ratingAvg: 4.9,
      ratingCount: 38,
      plant: { id: 'p1', name: 'Monstera Deliciosa', scientificName: 'Monstera deliciosa' },
      vendor: { id: 'v1', name: 'Indiranagar Urban Jungle', slug: 'indiranagar-urban-jungle' },
      distanceKm: 2.4,
      score: 98,
      reasons: ['Top trending indoor statement foliage in Bengaluru apartments'],
    },
    {
      productId: 'snake-plant-curated',
      title: 'Sansevieria Trifasciata (Snake Plant)',
      price: '340',
      stock: 40,
      imageUrl: 'https://images.unsplash.com/photo-1593691509543-c55fb32e7355?auto=format&fit=crop&w=600&q=80',
      ratingAvg: 4.8,
      ratingCount: 42,
      plant: { id: 'p2', name: 'Snake Plant', scientificName: 'Sansevieria trifasciata' },
      vendor: { id: 'v2', name: 'Lalbagh Green Nursery', slug: 'lalbagh-green-nursery' },
      distanceKm: 3.1,
      score: 95,
      reasons: ['NASA-verified air purifying succulent, thrives in indirect light'],
    },
    {
      productId: 'fiddle-leaf-fig-curated',
      title: 'Ficus Lyrata (Fiddle Leaf Fig)',
      price: '1150',
      stock: 12,
      imageUrl: 'https://images.unsplash.com/photo-1545241047-6083a3684587?auto=format&fit=crop&w=600&q=80',
      ratingAvg: 4.7,
      ratingCount: 29,
      plant: { id: 'p3', name: 'Fiddle Leaf Fig', scientificName: 'Ficus lyrata' },
      vendor: { id: 'v3', name: 'Whitefield Plant Studio', slug: 'whitefield-plant-studio' },
      distanceKm: 5.2,
      score: 92,
      reasons: ['Biophilic architectural plant favored for living spaces'],
    },
    {
      productId: 'peace-lily-curated',
      title: 'Spathiphyllum (Peace Lily in Ceramic Pot)',
      price: '420',
      stock: 30,
      imageUrl: 'https://images.unsplash.com/photo-1593482892290-f54927ae1bf6?auto=format&fit=crop&w=600&q=80',
      ratingAvg: 4.6,
      ratingCount: 31,
      plant: { id: 'p4', name: 'Peace Lily', scientificName: 'Spathiphyllum wallisii' },
      vendor: { id: 'v4', name: 'Jayanagar Flower Bazaar', slug: 'jayanagar-flower-bazaar' },
      distanceKm: 4.0,
      score: 90,
      reasons: ['Glossy dark leaves with pure white spathe blooms'],
    },
  ],
};

const FEATURED_NURSERIES = [
  {
    slug: 'lalbagh-green-nursery',
    name: 'Lalbagh Green Nursery',
    area: 'Siddapura Gate, Lalbagh',
    badge: '👑 Heritage Nursery',
    tagline: 'Three Generations of Botanical Heritage in Bengaluru',
    rating: 4.8,
    reviews: 42,
    plantsCount: 18,
    deliveryFee: '₹49',
    deliveryRadius: '8 km',
    image: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=800&q=80',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    specialty: 'Flowering Shrubs & Lalbagh Seedlings',
  },
  {
    slug: 'indiranagar-urban-jungle',
    name: 'Indiranagar Urban Jungle',
    area: '12th Main, HAL 2nd Stage',
    badge: '🪴 Urban Design Studio',
    tagline: 'Curated Boutique Foliage & Handcrafted Ceramic Planters',
    rating: 4.9,
    reviews: 38,
    plantsCount: 16,
    deliveryFee: '₹59',
    deliveryRadius: '6 km',
    image: 'https://images.unsplash.com/photo-1463936575829-25148e1db1b8?auto=format&fit=crop&w=800&q=80',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80',
    specialty: 'Rare Aroids, Monstera & Low-Light Greens',
  },
  {
    slug: 'whitefield-plant-studio',
    name: 'Whitefield Plant Studio',
    area: 'Borewell Road, Whitefield',
    badge: '🌴 Specimen Tree Expert',
    tagline: 'Large-Format Indoor Trees & Biophilic Office Landscapes',
    rating: 4.7,
    reviews: 29,
    plantsCount: 14,
    deliveryFee: '₹79',
    deliveryRadius: '10 km',
    image: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=80',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    specialty: 'Fiddle Leaf Figs & Self-Watering Planters',
  },
  {
    slug: 'jayanagar-flower-bazaar',
    name: 'Jayanagar Flower Bazaar',
    area: '4th Block, Jayanagar',
    badge: '🌸 Fragrant Flora Haven',
    tagline: 'Seasonal Blooming Beauties, Fragrant Jasmine & Marigold',
    rating: 4.6,
    reviews: 31,
    plantsCount: 12,
    deliveryFee: '₹39',
    deliveryRadius: '5 km',
    image: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&w=800&q=80',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    specialty: 'Ramanagara Marigold & Fresh Jasmine Pots',
  },
];

const CATEGORIES = [
  {
    name: 'Indoor Jungle',
    icon: '🪴',
    tag: 'INDOOR',
    desc: 'Air purifying statement foliage for rooms & desks',
    image: 'https://images.unsplash.com/photo-1545241047-6083a3684587?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Outdoor Palms & Balcony',
    icon: '🌴',
    tag: 'OUTDOOR',
    desc: 'Sun-loving shrubs & trees tailored for apartment balconies',
    image: 'https://images.unsplash.com/photo-1600411833196-7c1f6b1a8b90?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: '100% Pet-Safe Plants',
    icon: '🐾',
    tag: 'petFriendly',
    desc: 'Non-toxic, verified safe for curious cats and dogs',
    image: 'https://images.unsplash.com/photo-1593691509543-c55fb32e7355?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Flowering Beauties',
    icon: '🌸',
    tag: 'flowering',
    desc: 'Vivid seasonal blooms and sweet morning fragrance',
    image: 'https://images.unsplash.com/photo-1550950158-d0d960dff51b?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Succulents & Cacti',
    icon: '🌵',
    tag: 'succulents',
    desc: 'Drought-tolerant, sculpted desert beauties',
    image: 'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Low Light Champions',
    icon: '☁️',
    tag: 'lowLight',
    desc: 'Thrives effortlessly in cozy shaded corners & offices',
    image: 'https://images.unsplash.com/photo-1593482892290-f54927ae1bf6?auto=format&fit=crop&w=600&q=80',
  },
];

const CARE_TIPS = [
  {
    title: '💧 The 2-Inch Moisture Test',
    desc: 'Before watering, dip your finger 2 inches into the soil. If damp, wait 2 more days. Overwatering is the #1 plant hazard in Bengaluru apartments.',
  },
  {
    title: '☀️ Filtered Sun Glow',
    desc: 'Place your tropical plants near east or south-facing windows with sheer curtains. They flourish in glowing indirect light, avoiding leaf scorch.',
  },
  {
    title: '🍃 Monthly Leaf Dusting',
    desc: 'Gently wipe leaves with a soft damp microfiber cloth every month. Clean stomata absorb 40% more natural light for lush, glossy growth.',
  },
];

export default async function Home() {
  const [health, picks] = await Promise.all([
    fetchHealth(),
    serverApiSafe<RecommendationResponse>('/recommendations?limit=8', {
      isPublic: true,
      revalidate: 60,
    }),
  ]);

  const displayPicks = picks && picks.items.length > 0 ? picks : POPULAR_FALLBACK_PICKS;

  return (
    <main className="flex flex-col items-center min-h-screen bg-[#fafcf9] dark:bg-[#090e0b]">

      {/* ── HERO SECTION ────────────────────────────────────────── */}
      <section className="relative w-full overflow-hidden border-b border-emerald-900/10 bg-gradient-to-b from-emerald-100/70 via-emerald-50/40 to-transparent dark:border-emerald-500/10 dark:from-emerald-950/40 dark:via-emerald-950/10 dark:to-transparent">
        {/* Ambient botanical background circles */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl dark:bg-emerald-600/10" />

        <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 py-16 sm:py-24 text-center">
          {/* Live Marketplace Status Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/80 bg-white/90 px-4 py-1.5 text-xs font-bold text-emerald-900 shadow-sm backdrop-blur-md dark:border-emerald-700/60 dark:bg-zinc-900/90 dark:text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Bengaluru’s Multi-Vendor Botanical Marketplace</span>
          </div>

          {/* Hero Main Heading */}
          <h1 className="text-4xl font-black tracking-tight text-zinc-900 sm:text-6xl dark:text-zinc-50 leading-tight">
            Fresh plants from local nurseries,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 dark:from-emerald-400 dark:to-teal-300">
              delivered to your door
            </span>
          </h1>

          <p className="max-w-2xl text-base text-zinc-600 sm:text-lg dark:text-zinc-300 leading-relaxed">
            Discover verified nurseries near you, order pre-potted plants from multiple growers in a single unified cart, and enjoy same-day eco-friendly delivery.
          </p>

          {/* Quick Stats Pill */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-bold text-zinc-700 dark:text-zinc-300">
            <span className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 shadow-2xs backdrop-blur dark:bg-zinc-900/80">
              <span>🪴</span> 500+ Healthy Plants
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 shadow-2xs backdrop-blur dark:bg-zinc-900/80">
              <span>🏡</span> 5 Bengaluru Nurseries
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 shadow-2xs backdrop-blur dark:bg-zinc-900/80">
              <span>🛵</span> Same-Day Local Delivery
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 shadow-2xs backdrop-blur dark:bg-zinc-900/80">
              <span>⭐</span> 4.9/5 Botanical Quality
            </span>
          </div>

          {/* Main Search Bar */}
          <div className="w-full max-w-xl mt-3">
            <form action="/search" method="GET" className="relative flex items-center">
              <input
                type="text"
                name="q"
                placeholder="Search Monstera, Snake Plant, Peace Lily, Areca Palm, Hibiscus..."
                className="w-full rounded-2xl border border-zinc-300/80 bg-white/95 px-5 py-4 pr-32 text-sm text-zinc-900 shadow-lg shadow-emerald-900/5 backdrop-blur-sm transition focus:border-emerald-600 focus:outline-none focus:ring-4 focus:ring-emerald-500/15 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100 dark:placeholder-zinc-500"
              />
              <button
                type="submit"
                className="absolute right-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-black text-white shadow-md shadow-emerald-600/30 transition hover:from-emerald-700 hover:to-teal-700"
              >
                Search 🔍
              </button>
            </form>

            {/* Quick Filter Tag Chips */}
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-semibold">
              <Link
                href="/search?placement=INDOOR"
                className="rounded-full bg-white px-3.5 py-1 text-zinc-700 border border-zinc-200 hover:border-emerald-500 hover:text-emerald-700 shadow-2xs dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:text-emerald-400 transition"
              >
                🪴 Indoor Jungle
              </Link>
              <Link
                href="/search?placement=OUTDOOR"
                className="rounded-full bg-white px-3.5 py-1 text-zinc-700 border border-zinc-200 hover:border-emerald-500 hover:text-emerald-700 shadow-2xs dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:text-emerald-400 transition"
              >
                🌴 Balcony Palms
              </Link>
              <Link
                href="/search?petFriendly=true"
                className="rounded-full bg-white px-3.5 py-1 text-zinc-700 border border-zinc-200 hover:border-emerald-500 hover:text-emerald-700 shadow-2xs dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:text-emerald-400 transition"
              >
                🐾 100% Pet-Safe
              </Link>
              <Link
                href="/search?airPurifying=true"
                className="rounded-full bg-white px-3.5 py-1 text-zinc-700 border border-zinc-200 hover:border-emerald-500 hover:text-emerald-700 shadow-2xs dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:text-emerald-400 transition"
              >
                🍃 Air Purifying
              </Link>
              <Link
                href="/search?difficulty=EASY"
                className="rounded-full bg-white px-3.5 py-1 text-zinc-700 border border-zinc-200 hover:border-emerald-500 hover:text-emerald-700 shadow-2xs dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:text-emerald-400 transition"
              >
                ⚡ Beginner Friendly
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURED NURSERIES SHOWCASE ────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              📍 Bengaluru Grower Network
            </div>
            <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl mt-1">
              Featured Local Nurseries
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Order directly from independent grower storefronts with local dispatch and expert care.
            </p>
          </div>
          <Link
            href="/nearby"
            className="mt-3 sm:mt-0 inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 transition"
          >
            🗺️ Open Interactive Map →
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURED_NURSERIES.map((nursery) => (
            <Link
              key={nursery.slug}
              href={`/shops/${nursery.slug}`}
              className="group flex flex-col overflow-hidden rounded-3xl border border-zinc-200/90 bg-white shadow-xs transition duration-300 hover:-translate-y-1.5 hover:border-emerald-300 hover:shadow-xl dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-700"
            >
              {/* Nursery Cover Photo */}
              <div className="relative h-44 w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                <img
                  src={nursery.image}
                  alt={nursery.name}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />

                {/* Badge Overlay */}
                <div className="absolute top-3 left-3">
                  <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                    {nursery.badge}
                  </span>
                </div>

                {/* Delivery details on image */}
                <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] text-white">
                  <span className="font-semibold">{nursery.area}</span>
                  <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold backdrop-blur">
                    {nursery.deliveryRadius} radius
                  </span>
                </div>
              </div>

              {/* Nursery Information */}
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center gap-3">
                  <img
                    src={nursery.avatar}
                    alt={nursery.name}
                    className="h-10 w-10 shrink-0 rounded-xl object-cover border-2 border-white shadow-sm dark:border-zinc-800"
                  />
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 group-hover:text-emerald-700 dark:text-zinc-100 dark:group-hover:text-emerald-400 leading-snug">
                      {nursery.name}
                    </h3>
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                      <span>★ {nursery.rating.toFixed(1)}</span>
                      <span className="text-zinc-400">({nursery.reviews} reviews)</span>
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                  {nursery.specialty}
                </p>

                <div className="mt-auto pt-4 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800/80">
                  <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                    🌿 {nursery.plantsCount} plants available
                  </span>
                  <span className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white transition group-hover:bg-emerald-700">
                    Visit Store →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── BROWSE BY BOTANICAL CATEGORY ───────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
              Explore Botanical Categories
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Find the perfect greenery tailored for your lighting conditions & lifestyle.
            </p>
          </div>
          <Link
            href="/search"
            className="mt-2 sm:mt-0 text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Explore all plants →
          </Link>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.name}
              href={`/search?${cat.tag === 'INDOOR' || cat.tag === 'OUTDOOR' ? `placement=${cat.tag}` : `${cat.tag}=true`}`}
              className="group relative flex overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-xs transition duration-300 hover:-translate-y-1 hover:border-emerald-400 hover:shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            >
              {/* Photo on side */}
              <div className="relative h-full w-28 shrink-0 overflow-hidden bg-emerald-50 dark:bg-emerald-950">
                <img
                  src={cat.image}
                  alt={cat.name}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-110"
                />
              </div>

              {/* Text content */}
              <div className="flex flex-1 flex-col justify-center p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{cat.icon}</span>
                  <h3 className="text-sm font-bold text-zinc-900 group-hover:text-emerald-700 dark:text-zinc-100 dark:group-hover:text-emerald-400">
                    {cat.name}
                  </h3>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {cat.desc}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  Shop collection →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── INTERACTIVE PLANT CONSULTANT QUIZ ─────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <PlantQuizWidget />
      </section>

      {/* ── RECOMMENDATIONS & POPULAR PLANTS ───────────────────── */}
      {displayPicks && displayPicks.items.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-6 py-12">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                🌿 Handpicked Selections
              </div>
              <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl mt-1">
                {displayPicks.personalised ? '🌿 Curated Specially For You' : '🌿 Popular Right Now in Bengaluru'}
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {displayPicks.personalised
                  ? `Based on ${displayPicks.basedOn} plant${displayPicks.basedOn === 1 ? '' : 's'} in your order history`
                  : 'Healthy, root-checked stock from verified local nurseries with live courier delivery'}
              </p>
            </div>
            <Link
              href="/search"
              className="text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-400"
            >
              View entire catalogue →
            </Link>
          </div>
          <RecommendationGrid items={displayPicks.items} />
        </section>
      )}

      {/* ── WHY CHOOSE LOCAL NURSERIES ─────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="rounded-3xl border border-emerald-900/10 bg-gradient-to-tr from-emerald-50/60 via-white to-teal-50/40 p-8 shadow-xs dark:border-emerald-500/10 dark:from-zinc-900 dark:via-zinc-900/80 dark:to-zinc-900">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              The E-PlantShopping Difference
            </span>
            <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl mt-3">
              Why Buy Direct from Bengaluru Nurseries?
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2">
              Say goodbye to boxed warehouse plants that suffer in dark shipping trucks for days.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-800/80">
              <span className="text-3xl">🌦️</span>
              <h3 className="mt-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">Climate Acclimated</h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Grown in Bengaluru weather conditions. Zero sudden leaf drop, climate shock, or browning.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-800/80">
              <span className="text-3xl">🛵</span>
              <h3 className="mt-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">Zero Box Trauma</h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Hand-delivered upright in 2-4 hours by local couriers. Roots remain intact and stress-free.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-800/80">
              <span className="text-3xl">🪴</span>
              <h3 className="mt-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">Nursery-Grade Soil</h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Pre-potted in rich vermicompost, perlite, and red loam. No immediate repotting required.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-800/80">
              <span className="text-3xl">💚</span>
              <h3 className="mt-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">Direct Grower Impact</h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                100% of purchase value directly supports local family nurseries and Bengaluru horticulturalists.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── BOTANICAL CARE GUIDES ──────────────────────────────── */}
      <section id="care-guide" className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="text-center max-w-xl mx-auto mb-8">
          <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            Botanical Care Essentials
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Expert guidelines to keep your plants lush and thriving all year round.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {CARE_TIPS.map((tip) => (
            <div
              key={tip.title}
              className="rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-xs transition hover:border-emerald-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h3 className="mb-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">{tip.title}</h3>
              <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{tip.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── DEV HEALTH CARD (BOTTOM) ───────────────────────────── */}
      <div className="mx-auto w-full max-w-6xl px-6 pb-16">
        <HealthCard initial={health} />
      </div>

    </main>
  );
}
