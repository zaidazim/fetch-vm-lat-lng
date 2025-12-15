import { NextResponse } from 'next/server';

const LOCATIONIQ_KEY = process.env.LOCATIONIQ_API_KEY;

// In-memory cache
const resultCache = new Map<string, any>();

function normalize(str: string): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '').trim();
}

// Typo map for states
const STATE_MAP: Record<string, string> = {
  'maharastra': 'maharashtra',
  'telengana': 'telangana',
  // Add more as needed
};

function normalizeState(state: string): string {
  const norm = normalize(state);
  return STATE_MAP[norm] || norm;
}

interface Candidate {
  lat: string;
  lon: string;
  display_name: string;
  address?: any;
  class?: string;
  type?: string;
  score?: number;
}

function scoreCandidate(candidate: Candidate, input: any): number {
  let score = 0;
  const cAddr = candidate.address || {};

  // Normalize input
  const inState = normalizeState(input.state);
  const inCity = normalize(input.city);
  const inZip = normalize(input.postal);

  // Normalize candidate
  const cState = normalizeState(cAddr.state || '');
  const cCity = normalize(cAddr.city || cAddr.town || cAddr.village || cAddr.suburb || cAddr.county || '');
  const cZip = normalize(cAddr.postcode || '');

  // State match
  if (inState && cState) {
    if (cState === inState || cState.includes(inState) || inState.includes(cState)) {
      score += 3;
    } else {
      score -= 5;
    }
  }

  // City match
  if (inCity) {
    if (cCity === inCity || cCity.includes(inCity) || inCity.includes(cCity)) {
      score += 2;
    } else {
      // Check if display name contains city
      const normDisplay = normalize(candidate.display_name);
      if (normDisplay.includes(inCity)) {
        score += 1; // Partial credit
      } else {
        score -= 3;
      }
    }
  }

  // Display name match tokens
  const normDisplay = normalize(candidate.display_name);
  if (inCity && normDisplay.includes(inCity)) score += 1; // Bonus
  if (inState && normDisplay.includes(inState)) score += 1; // Bonus

  // Zip match
  if (inZip && cZip && cZip === inZip) {
    score += 2;
  }

  // Street match (Token overlap)
  const inStreet = normalize(input.street || input.address);
  const cStreet = normalize(cAddr.road || cAddr.street || cAddr.pedestrian || '');
  if (inStreet && cStreet) {
    if (inStreet.includes(cStreet) || cStreet.includes(inStreet)) {
      score += 2;
    } else {
      // Token overlap check
      const inTokens = inStreet.split(' ').filter(t => t.length > 3);
      const cTokens = cStreet.split(' ').filter(t => t.length > 3);
      const overlap = inTokens.filter(t => cStreet.includes(t));
      if (overlap.length > 0) score += 1;
    }
  }

  // VM Name Context Match (e.g. "Gachibowli")
  if (input.vmName) {
    const normVM = normalize(input.vmName);
    const vmTokens = normVM.split(' ').filter(t => t.length > 3 && t !== 'spaces' && t !== 'center');
    // Check if candidate display name or address contains these tokens
    const cText = normalize(candidate.display_name);
    const overlap = vmTokens.filter(t => cText.includes(t));
    if (overlap.length > 0) score += 2; // Strong signal for area
  }

  // POI bonus
  if (input.vmName) {
    // If we used VM Name, and we got a specific class type
    if (candidate.class === 'amenity' || candidate.class === 'shop' || candidate.class === 'office' || candidate.class === 'building') {
      score += 1;
    }
  }

  return score;
}

async function fetchLocationIQ(url: string): Promise<{ candidates: Candidate[], status: number, retryAfter?: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return {
        candidates: [],
        status: res.status,
        retryAfter: res.headers.get('Retry-After') || undefined
      };
    }
    const data = await res.json();
    return { candidates: Array.isArray(data) ? data : [], status: 200 };
  } catch (error) {
    console.error('Fetch error:', error);
    return { candidates: [], status: 500 };
  }
}

function cleanStreet(street: string, city: string, state: string, postal: string): string {
  if (!street) return '';
  let cleaned = street;
  // Remove postal
  if (postal) cleaned = cleaned.replace(new RegExp(postal, 'gi'), '');
  // Remove state
  if (state) cleaned = cleaned.replace(new RegExp(state, 'gi'), '');
  // Remove city
  if (city) cleaned = cleaned.replace(new RegExp(city, 'gi'), '');

  // Clean up punctuation/extra spaces
  return cleaned.replace(/[,.-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let { address, vmName, street, city, state, postal } = body;

    // Clean street if it looks messy (contains city/state)
    const originalStreet = street;
    street = cleanStreet(street, city, state, postal);

    // If we scrubbed everything away (e.g. street was just "Hyderabad"), revert to original but careful
    if (street.length < 3) street = originalStreet;

    // Cache Key
    const cacheKey = [vmName, street, city, state, postal].map(normalize).join('|');
    if (resultCache.has(cacheKey)) {
      console.log(`Cache hit for ${cacheKey}`);
      return NextResponse.json(resultCache.get(cacheKey));
    }

    if (!LOCATIONIQ_KEY) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Common params
    const commonParams = `&key=${LOCATIONIQ_KEY}&format=json&limit=10&countrycodes=in&addressdetails=1&dedupe=1`;
    let candidates: Candidate[] = [];

    // COLLECT ALL CANDIDATES FROM MULTIPLE STRATEGIES
    const strategies = [];

    // Strategy 1: POI Autocomplete
    if (vmName && vmName.length >= 4 && !vmName.toLowerCase().startsWith('vm')) {
      const q = `${vmName}, ${city || ''}, ${state || ''}`;
      const url = `https://us1.locationiq.com/v1/autocomplete?q=${encodeURIComponent(q)}${commonParams}&namedetails=1`;
      console.log(`Trying Autocomplete: ${q}`);
      strategies.push(fetchLocationIQ(url));
    }

    // Strategy 2: Structured Search (if available)
    if (street || city || state) {
      let structParams = '';
      if (street) structParams += `&street=${encodeURIComponent(street)}`;
      if (city) structParams += `&city=${encodeURIComponent(city)}`;
      if (state) structParams += `&state=${encodeURIComponent(state)}`;
      if (postal) structParams += `&postalcode=${encodeURIComponent(postal)}`;

      const url = `https://us1.locationiq.com/v1/search/structured?${structParams}${commonParams}`;
      console.log(`Trying Structured Search`);
      strategies.push(fetchLocationIQ(url));
    }

    // Wait for initial strategies
    const results = await Promise.all(strategies);
    let retryAfterHeader = null;

    results.forEach(r => {
      if (r.status === 429 && r.retryAfter) retryAfterHeader = r.retryAfter;
      if (r.candidates.length > 0) candidates.push(...r.candidates);
    });

    // If rate limited, return immediately
    if (retryAfterHeader) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': retryAfterHeader } });
    }

    // Evaluate initial candidates
    let currentMaxScore = -100;
    candidates.forEach(c => {
      const s = scoreCandidate(c, body);
      c.score = s;
      if (s > currentMaxScore) currentMaxScore = s;
    });

    // Strategy 3: Fallback (If no candidates OR best candidate is not excellent)
    // We want a score of at least 8 (e.g., State+City+Zip+Street match, or State+City+Name+Zip)
    // If our best candidate is weak (e.g. just City+State match), try finding a better address match.
    if (candidates.length === 0 || currentMaxScore < 8) {
      const q1 = [vmName, city, state, 'India', postal].filter(Boolean).join(', ');
      const q2 = [vmName, street, city, state, 'India', postal].filter(Boolean).join(', ');
      const q3 = [street, city, state, 'India', postal].filter(Boolean).join(', ');
      const q4 = [city, state, 'India', postal].filter(Boolean).join(', ');

      const queries = [q1, q2, q3, q4];
      const uniqueQueries = [...new Set(queries)].filter(q => q && q.length > 10);

      for (const q of uniqueQueries) {
        console.log(`Trying Fallback Query: ${q}`);
        const url = `https://us1.locationiq.com/v1/search?q=${encodeURIComponent(q)}${commonParams}`;
        const res = await fetchLocationIQ(url);
        if (res.status === 429) {
          return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: res.retryAfter ? { 'Retry-After': res.retryAfter } : {} });
        }
        if (res.candidates.length > 0) {
          candidates.push(...res.candidates);
          // If we found something, do we stop? 
          // We should probably check if this new thing is "good enough".
          // For simplicity/speed, let's assume finding *any* address fallback is good enough to proceed to final scoring.
          break;
        }
      }
    }

    // Deduplicate candidates based on place_id or lat/lon
    const uniqueCandidates = new Map();
    candidates.forEach(c => {
      const key = (c as any).place_id || `${c.lat},${c.lon}`;
      if (!uniqueCandidates.has(key)) {
        uniqueCandidates.set(key, c);
      }
    });
    candidates = Array.from(uniqueCandidates.values());

    if (candidates.length === 0) {
      return NextResponse.json({ error: 'No results found', status: 'Failed' }, { status: 404 });
    }

    // Scoring
    let bestCandidate = null;
    let maxScore = -100;

    candidates.forEach(c => {
      const s = scoreCandidate(c, body);
      c.score = s;
      // console.log(`Candidate: ${c.display_name} | Score: ${s}`); // Debug logging
      if (s > maxScore) {
        maxScore = s;
        bestCandidate = c;
      }
    });

    if (!bestCandidate) bestCandidate = candidates[0]; // Should not happen if length > 0

    // Confidence Calculation
    let confidence = 0.5;
    if (maxScore >= 5) confidence = 0.9;
    else if (maxScore >= 3) confidence = 0.8;
    else if (maxScore >= 0) confidence = 0.7;
    else confidence = 0.4;

    // Cap at 1.0
    confidence = Math.min(confidence, 1.0);

    const result = {
      latitude: parseFloat((bestCandidate as any).lat),
      longitude: parseFloat((bestCandidate as any).lon),
      placeName: (bestCandidate as any).display_name,
      confidence,
      status: confidence >= 0.75 ? 'Success' : 'Low confidence',
    };

    // Cache the result
    resultCache.set(cacheKey, result);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Geocoding error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
