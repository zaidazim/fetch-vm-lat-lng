import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { address } = await request.json();

    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    const encodedAddress = encodeURIComponent(address);
    const apiKey = process.env.LOCATIONIQ_API_KEY;
    if (!apiKey) {
      console.error('LOCATIONIQ_API_KEY is missing');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // LocationIQ API endpoint
    const url = `https://us1.locationiq.com/v1/search?key=${apiKey}&q=${encodedAddress}&format=json&limit=1`;

    console.log(`Geocoding request for: "${address}"`);

    const response = await fetch(url);
    console.log(`LocationIQ response status: ${response.status}`);

    if (!response.ok) {
      if (response.status === 404) {
        console.log('LocationIQ matched no results');
        return NextResponse.json(
          { error: 'No results found' },
          { status: 404 }
        );
      }
      throw new Error(`LocationIQ API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (data && data.length > 0) {
      const result = data[0];
      return NextResponse.json({
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        placeName: result.display_name,
      });
    } else {
      console.log('LocationIQ returned empty array');
      return NextResponse.json(
        { error: 'No results found' },
        { status: 404 }
      );
    }
  } catch (error: any) {
    console.error('Geocoding error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
